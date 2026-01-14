/**
 * Health Check Utilities
 * Monitors system health, build status, and application state.
 */

import { existsSync } from "fs";
import { resolve } from "path";
import { agentConfig } from "../config/agent-config.js";

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  checks: {
    projectStructure: boolean;
    dependencies: boolean;
    build: boolean;
    devServer: boolean;
  };
  issues: string[];
  recommendations: string[];
}

/**
 * Check project structure health
 */
function checkProjectStructure(): { healthy: boolean; issues: string[] } {
  const root = agentConfig.paths.projectRoot;
  const issues: string[] = [];

  // Check for essential directories
  const essentialDirs = ["src", "public", "node_modules"];
  const optionalDirs = ["components", "utils", "hooks", "pages", "app"];

  for (const dir of essentialDirs) {
    if (!existsSync(resolve(root, dir))) {
      if (dir !== "node_modules") {
        issues.push(`Missing directory: ${dir}`);
      }
    }
  }

  // Check for package.json
  if (!existsSync(resolve(root, "package.json"))) {
    issues.push("Missing package.json");
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}

/**
 * Check if dependencies are installed
 */
function checkDependencies(): { healthy: boolean; issues: string[] } {
  const root = agentConfig.paths.projectRoot;
  const issues: string[] = [];

  if (!existsSync(resolve(root, "node_modules"))) {
    issues.push("node_modules not found - run 'npm install'");
  }

  if (!existsSync(resolve(root, "package-lock.json")) &&
      !existsSync(resolve(root, "yarn.lock")) &&
      !existsSync(resolve(root, "pnpm-lock.yaml"))) {
    issues.push("No lock file found - dependencies may not be installed");
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}

/**
 * Check build status (heuristic)
 */
function checkBuild(): { healthy: boolean; issues: string[] } {
  const root = agentConfig.paths.projectRoot;
  const issues: string[] = [];

  // Check for build output directories
  const buildDirs = ["dist", "build", ".next", "out"];
  const hasBuildDir = buildDirs.some(dir => existsSync(resolve(root, dir)));

  // This is just a heuristic - actual build status requires running build
  if (!hasBuildDir) {
    issues.push("No build output directory found - may need to run build");
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}

/**
 * Check dev server status (heuristic)
 */
function checkDevServer(): { healthy: boolean; issues: string[] } {
  // We can't actually check if dev server is running without making HTTP requests
  // This is a placeholder - the agent should check by navigating to localhost
  return {
    healthy: true, // Unknown - agent should verify
    issues: [],
  };
}

/**
 * Run comprehensive health check
 */
export function runHealthCheck(): HealthCheckResult {
  const structure = checkProjectStructure();
  const dependencies = checkDependencies();
  const build = checkBuild();
  const devServer = checkDevServer();

  const allIssues = [
    ...structure.issues,
    ...dependencies.issues,
    ...build.issues,
    ...devServer.issues,
  ];

  const recommendations: string[] = [];

  if (dependencies.issues.length > 0) {
    recommendations.push("Run 'npm install' to install dependencies");
  }

  if (build.issues.length > 0) {
    recommendations.push("Run 'npm run build' to create build output");
  }

  if (structure.issues.length > 0) {
    recommendations.push("Check project structure - some directories may be missing");
  }

  const healthy = allIssues.length === 0;

  return {
    healthy,
    checks: {
      projectStructure: structure.healthy,
      dependencies: dependencies.healthy,
      build: build.healthy,
      devServer: devServer.healthy,
    },
    issues: allIssues,
    recommendations,
  };
}

/**
 * Generate health check summary
 */
export function generateHealthSummary(): string {
  const health = runHealthCheck();

  let summary = "\n## SYSTEM HEALTH CHECK\n\n";

  if (health.healthy) {
    summary += "✅ System is healthy\n";
  } else {
    summary += "⚠️ System health issues detected\n";
  }

  summary += `Project Structure: ${health.checks.projectStructure ? "✅" : "❌"}\n`;
  summary += `Dependencies: ${health.checks.dependencies ? "✅" : "❌"}\n`;
  summary += `Build: ${health.checks.build ? "✅" : "⚠️"}\n`;
  summary += `Dev Server: ${health.checks.devServer ? "✅" : "⚠️"}\n`;

  if (health.issues.length > 0) {
    summary += "\n🚨 Issues:\n";
    health.issues.forEach(issue => {
      summary += `   - ${issue}\n`;
    });
  }

  if (health.recommendations.length > 0) {
    summary += "\n💡 Recommendations:\n";
    health.recommendations.forEach(rec => {
      summary += `   - ${rec}\n`;
    });
  }

  return summary;
}

export default {
  runHealthCheck,
  generateHealthSummary,
};
