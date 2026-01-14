/**
 * Code Quality Utilities
 * Provides automated code quality checks, linting, and formatting validation.
 * Helps maintain consistent code quality across sessions.
 */

import { existsSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { agentConfig } from "../config/agent-config.js";

/**
 * Code quality check results
 */
export interface QualityCheckResult {
  passed: boolean;
  checks: {
    typeChecking: CheckResult;
    linting: CheckResult;
    formatting: CheckResult;
    build: CheckResult;
  };
  errors: string[];
  warnings: string[];
}

export interface CheckResult {
  status: "pass" | "fail" | "skip" | "unknown";
  message: string;
  command?: string;
}

/**
 * Check if TypeScript type checking passes
 */
export function checkTypeScript(): CheckResult {
  const root = agentConfig.paths.projectRoot;
  const tsconfigPath = resolve(root, "tsconfig.json");

  if (!existsSync(tsconfigPath)) {
    return {
      status: "skip",
      message: "No TypeScript configuration found",
    };
  }

  // Check if typecheck script exists in package.json
  try {
    const packageJsonPath = resolve(root, "package.json");
    if (existsSync(packageJsonPath)) {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const scripts = pkg.scripts || {};
      
      if (scripts.typecheck || scripts["type-check"]) {
        return {
          status: "unknown",
          message: "TypeScript configuration found - run 'npm run typecheck' to verify",
          command: "npm run typecheck",
        };
      }
    }
  } catch {
    // Silently fail
  }

  return {
    status: "unknown",
    message: "TypeScript configuration found but no typecheck script",
  };
}

/**
 * Check if linting is configured
 */
export function checkLinting(): CheckResult {
  const root = agentConfig.paths.projectRoot;
  
  // Check for common linting config files
  const lintConfigs = [
    ".eslintrc.js",
    ".eslintrc.json",
    ".eslintrc.yml",
    ".eslintrc.yaml",
    "eslint.config.js",
    "eslint.config.mjs",
    ".eslintrc",
  ];

  const hasLintConfig = lintConfigs.some(config => 
    existsSync(resolve(root, config))
  );

  if (!hasLintConfig) {
    return {
      status: "skip",
      message: "No ESLint configuration found",
    };
  }

  // Check for lint script
  try {
    const packageJsonPath = resolve(root, "package.json");
    if (existsSync(packageJsonPath)) {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const scripts = pkg.scripts || {};
      
      if (scripts.lint) {
        return {
          status: "unknown",
          message: "ESLint configured - run 'npm run lint' to check code quality",
          command: "npm run lint",
        };
      }
    }
  } catch {
    // Silently fail
  }

  return {
    status: "unknown",
    message: "ESLint configuration found but no lint script",
  };
}

/**
 * Check if code formatting is configured
 */
export function checkFormatting(): CheckResult {
  const root = agentConfig.paths.projectRoot;
  
  // Check for Prettier
  const prettierConfigs = [
    ".prettierrc",
    ".prettierrc.json",
    ".prettierrc.js",
    ".prettierrc.yml",
    "prettier.config.js",
    ".prettierrc.yaml",
  ];

  const hasPrettier = prettierConfigs.some(config => 
    existsSync(resolve(root, config))
  ) || existsSync(resolve(root, ".prettierignore"));

  // Check for format script
  try {
    const packageJsonPath = resolve(root, "package.json");
    if (existsSync(packageJsonPath)) {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const scripts = pkg.scripts || {};
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      if (scripts.format || scripts.prettier) {
        return {
          status: "unknown",
          message: "Prettier configured - run 'npm run format' to format code",
          command: scripts.format ? "npm run format" : "npm run prettier",
        };
      } else if (hasPrettier || deps.prettier) {
        return {
          status: "unknown",
          message: "Prettier installed but no format script - add 'format' script to package.json",
        };
      }
    }
  } catch {
    // Silently fail
  }

  if (hasPrettier) {
    return {
      status: "unknown",
      message: "Prettier configuration found",
    };
  }

  return {
    status: "skip",
    message: "No code formatter configured",
  };
}

/**
 * Check if project builds successfully
 */
export function checkBuild(): CheckResult {
  const root = agentConfig.paths.projectRoot;
  
  try {
    const packageJsonPath = resolve(root, "package.json");
    if (existsSync(packageJsonPath)) {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const scripts = pkg.scripts || {};
      
      if (scripts.build) {
        return {
          status: "unknown",
          message: "Build script found - run 'npm run build' to verify build",
          command: "npm run build",
        };
      }
    }
  } catch {
    // Silently fail
  }

  return {
    status: "skip",
    message: "No build script found",
  };
}

/**
 * Run all code quality checks
 */
export function runQualityChecks(): QualityCheckResult {
  const typeChecking = checkTypeScript();
  const linting = checkLinting();
  const formatting = checkFormatting();
  const build = checkBuild();

  const errors: string[] = [];
  const warnings: string[] = [];

  // Collect errors and warnings
  if (typeChecking.status === "fail") {
    errors.push(`Type checking: ${typeChecking.message}`);
  }
  if (linting.status === "fail") {
    errors.push(`Linting: ${linting.message}`);
  }
  if (formatting.status === "fail") {
    warnings.push(`Formatting: ${formatting.message}`);
  }
  if (build.status === "fail") {
    errors.push(`Build: ${build.message}`);
  }

  const passed = errors.length === 0;

  return {
    passed,
    checks: {
      typeChecking,
      linting,
      formatting,
      build,
    },
    errors,
    warnings,
  };
}

/**
 * Generate quality check summary for agent prompts
 */
export function generateQualitySummary(): string {
  const result = runQualityChecks();
  
  let summary = "\n## CODE QUALITY STATUS\n\n";

  // Type checking
  if (result.checks.typeChecking.status !== "skip") {
    const icon = result.checks.typeChecking.status === "pass" ? "✅" : 
                 result.checks.typeChecking.status === "fail" ? "❌" : "⚠️";
    summary += `${icon} Type Checking: ${result.checks.typeChecking.message}\n`;
  }

  // Linting
  if (result.checks.linting.status !== "skip") {
    const icon = result.checks.linting.status === "pass" ? "✅" : 
                 result.checks.linting.status === "fail" ? "❌" : "⚠️";
    summary += `${icon} Linting: ${result.checks.linting.message}\n`;
  }

  // Formatting
  if (result.checks.formatting.status !== "skip") {
    const icon = result.checks.formatting.status === "pass" ? "✅" : 
                 result.checks.formatting.status === "fail" ? "❌" : "⚠️";
    summary += `${icon} Formatting: ${result.checks.formatting.message}\n`;
  }

  // Build
  if (result.checks.build.status !== "skip") {
    const icon = result.checks.build.status === "pass" ? "✅" : 
                 result.checks.build.status === "fail" ? "❌" : "⚠️";
    summary += `${icon} Build: ${result.checks.build.message}\n`;
  }

  if (result.errors.length > 0) {
    summary += "\n❌ Errors:\n";
    result.errors.forEach(e => {
      summary += `   - ${e}\n`;
    });
  }

  if (result.warnings.length > 0) {
    summary += "\n⚠️ Warnings:\n";
    result.warnings.forEach(w => {
      summary += `   - ${w}\n`;
    });
  }

  if (result.passed && result.errors.length === 0 && result.warnings.length === 0) {
    summary += "\n✅ All quality checks passed or skipped\n";
  }

  return summary;
}

export default {
  checkTypeScript,
  checkLinting,
  checkFormatting,
  checkBuild,
  runQualityChecks,
  generateQualitySummary,
};
