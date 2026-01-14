/**
 * Project Detection Utilities
 * Automatically detects project type, framework, and technology stack.
 * Enables the agent to adapt its behavior based on the project context.
 */

import { existsSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { agentConfig } from "../config/agent-config.js";

/**
 * Detected project information
 */
export interface ProjectInfo {
  type: "react" | "nextjs" | "vue" | "svelte" | "angular" | "vanilla" | "unknown";
  framework: string | null;
  packageManager: "npm" | "yarn" | "pnpm" | "bun" | "unknown";
  language: "typescript" | "javascript" | "both";
  buildTool: "vite" | "webpack" | "rollup" | "turbopack" | "unknown";
  testingFramework: "vitest" | "jest" | "playwright" | "cypress" | "none" | "unknown";
  backend: "supabase" | "express" | "fastify" | "nextjs-api" | "none" | "unknown";
  database: "supabase" | "postgres" | "mysql" | "mongodb" | "sqlite" | "none" | "unknown";
  styling: "tailwind" | "css-modules" | "styled-components" | "emotion" | "sass" | "css" | "unknown";
  monorepo: boolean;
  rootPath: string;
}

/**
 * Detect project type from package.json
 */
function detectFromPackageJson(packageJsonPath: string): Partial<ProjectInfo> {
  const info: Partial<ProjectInfo> = {};

  try {
    const content = readFileSync(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Detect framework
    if (deps["next"]) {
      info.type = "nextjs";
      info.framework = "Next.js";
      info.buildTool = "turbopack"; // Next.js 13+ uses Turbopack
    } else if (deps["react"]) {
      info.type = "react";
      info.framework = "React";
    } else if (deps["vue"]) {
      info.type = "vue";
      info.framework = "Vue.js";
    } else if (deps["svelte"]) {
      info.type = "svelte";
      info.framework = "Svelte";
    } else if (deps["@angular/core"]) {
      info.type = "angular";
      info.framework = "Angular";
    }

    // Detect build tool
    if (deps["vite"]) {
      info.buildTool = "vite";
    } else if (deps["webpack"]) {
      info.buildTool = "webpack";
    } else if (deps["rollup"]) {
      info.buildTool = "rollup";
    }

    // Detect testing framework
    if (deps["vitest"]) {
      info.testingFramework = "vitest";
    } else if (deps["jest"]) {
      info.testingFramework = "jest";
    } else if (deps["@playwright/test"]) {
      info.testingFramework = "playwright";
    } else if (deps["cypress"]) {
      info.testingFramework = "cypress";
    }

    // Detect backend
    if (deps["@supabase/supabase-js"]) {
      info.backend = "supabase";
    } else if (deps["express"]) {
      info.backend = "express";
    } else if (deps["fastify"]) {
      info.backend = "fastify";
    } else if (info.type === "nextjs") {
      info.backend = "nextjs-api";
    }

    // Detect database
    if (deps["@supabase/supabase-js"]) {
      info.database = "supabase";
    } else if (deps["pg"] || deps["postgres"]) {
      info.database = "postgres";
    } else if (deps["mysql2"] || deps["mysql"]) {
      info.database = "mysql";
    } else if (deps["mongodb"]) {
      info.database = "mongodb";
    } else if (deps["better-sqlite3"] || deps["sqlite3"]) {
      info.database = "sqlite";
    }

    // Detect styling
    if (deps["tailwindcss"]) {
      info.styling = "tailwind";
    } else if (deps["styled-components"]) {
      info.styling = "styled-components";
    } else if (deps["@emotion/react"] || deps["@emotion/styled"]) {
      info.styling = "emotion";
    } else if (deps["sass"] || deps["node-sass"]) {
      info.styling = "sass";
    } else if (existsSync(resolve(agentConfig.paths.projectRoot, "src", "index.module.css"))) {
      info.styling = "css-modules";
    }

    // Detect language
    const hasTS = existsSync(resolve(agentConfig.paths.projectRoot, "tsconfig.json"));
    const hasJS = existsSync(resolve(agentConfig.paths.projectRoot, "jsconfig.json")) ||
                  deps["@babel/core"] !== undefined;
    
    if (hasTS && hasJS) {
      info.language = "both";
    } else if (hasTS) {
      info.language = "typescript";
    } else {
      info.language = "javascript";
    }

    // Detect monorepo
    info.monorepo = existsSync(resolve(agentConfig.paths.projectRoot, "pnpm-workspace.yaml")) ||
                    existsSync(resolve(agentConfig.paths.projectRoot, "lerna.json")) ||
                    existsSync(resolve(agentConfig.paths.projectRoot, "turbo.json")) ||
                    (pkg.workspaces !== undefined);
  } catch (error) {
    // Silently fail
  }

  return info;
}

/**
 * Detect package manager from lock files
 */
function detectPackageManager(): "npm" | "yarn" | "pnpm" | "bun" | "unknown" {
  const root = agentConfig.paths.projectRoot;

  if (existsSync(join(root, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (existsSync(join(root, "yarn.lock"))) {
    return "yarn";
  }
  if (existsSync(join(root, "bun.lockb"))) {
    return "bun";
  }
  if (existsSync(join(root, "package-lock.json"))) {
    return "npm";
  }

  return "unknown";
}

/**
 * Detect project information
 */
export function detectProject(): ProjectInfo {
  const root = agentConfig.paths.projectRoot;
  const packageJsonPath = resolve(root, "package.json");

  const defaults: ProjectInfo = {
    type: "unknown",
    framework: null,
    packageManager: "unknown",
    language: "javascript",
    buildTool: "unknown",
    testingFramework: "unknown",
    backend: "unknown",
    database: "unknown",
    styling: "unknown",
    monorepo: false,
    rootPath: root,
  };

  if (!existsSync(packageJsonPath)) {
    return defaults;
  }

  const detected = detectFromPackageJson(packageJsonPath);
  const packageManager = detectPackageManager();

  return {
    ...defaults,
    ...detected,
    packageManager,
    rootPath: root,
  };
}

/**
 * Get project-specific recommendations
 */
export function getProjectRecommendations(info: ProjectInfo): string[] {
  const recommendations: string[] = [];

  if (info.type === "unknown") {
    recommendations.push("Project type could not be detected - ensure package.json exists");
  }

  if (info.testingFramework === "none" || info.testingFramework === "unknown") {
    recommendations.push("Consider adding a testing framework (Vitest, Jest, or Playwright)");
  }

  if (info.language === "javascript" && info.type !== "unknown") {
    recommendations.push("Consider migrating to TypeScript for better type safety");
  }

  if (info.buildTool === "unknown" && info.type !== "vanilla") {
    recommendations.push("Build tool not detected - ensure build configuration exists");
  }

  return recommendations;
}

/**
 * Generate a project summary string for agent prompts
 */
export function generateProjectSummary(): string {
  const info = detectProject();
  const recommendations = getProjectRecommendations(info);

  let summary = "\n## PROJECT DETECTION\n\n";
  summary += `Type: ${info.type}${info.framework ? ` (${info.framework})` : ""}\n`;
  summary += `Package Manager: ${info.packageManager}\n`;
  summary += `Language: ${info.language}\n`;
  summary += `Build Tool: ${info.buildTool}\n`;
  summary += `Testing: ${info.testingFramework}\n`;
  summary += `Backend: ${info.backend}\n`;
  summary += `Database: ${info.database}\n`;
  summary += `Styling: ${info.styling}\n`;
  summary += `Monorepo: ${info.monorepo ? "Yes" : "No"}\n`;

  if (recommendations.length > 0) {
    summary += "\n💡 Recommendations:\n";
    recommendations.forEach(r => {
      summary += `   - ${r}\n`;
    });
  }

  return summary;
}

export default {
  detectProject,
  getProjectRecommendations,
  generateProjectSummary,
};
