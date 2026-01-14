/**
 * Dependency Management Utilities
 * Checks for outdated dependencies, security vulnerabilities, and provides update recommendations.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { agentConfig } from "../config/agent-config.js";

/**
 * Dependency information
 */
export interface DependencyInfo {
  name: string;
  current: string;
  latest?: string;
  outdated: boolean;
  securityVulnerable: boolean;
  type: "dependency" | "devDependency";
}

/**
 * Dependency audit result
 */
export interface DependencyAudit {
  total: number;
  outdated: number;
  vulnerable: number;
  recommendations: string[];
  critical: DependencyInfo[];
  warnings: DependencyInfo[];
}

/**
 * Check package.json for dependency information
 */
export function analyzeDependencies(): DependencyAudit {
  const root = agentConfig.paths.projectRoot;
  const packageJsonPath = resolve(root, "package.json");

  if (!existsSync(packageJsonPath)) {
    return {
      total: 0,
      outdated: 0,
      vulnerable: 0,
      recommendations: ["No package.json found"],
      critical: [],
      warnings: [],
    };
  }

  try {
    const content = readFileSync(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    
    const deps = Object.entries(pkg.dependencies || {}).map(([name, version]) => ({
      name,
      current: version as string,
      type: "dependency" as const,
      outdated: false,
      securityVulnerable: false,
    }));

    const devDeps = Object.entries(pkg.devDependencies || {}).map(([name, version]) => ({
      name,
      current: version as string,
      type: "devDependency" as const,
      outdated: false,
      securityVulnerable: false,
    }));

    const allDeps = [...deps, ...devDeps];
    const total = allDeps.length;

    // Check for common security issues
    const vulnerable: DependencyInfo[] = [];
    const warnings: DependencyInfo[] = [];

    // Check for known vulnerable patterns
    allDeps.forEach(dep => {
      // Check for very old versions (heuristic)
      if (dep.current.includes("^0.") || dep.current.includes("~0.")) {
        warnings.push(dep);
      }

      // Check for missing version (shouldn't happen but check anyway)
      if (!dep.current || dep.current === "*") {
        vulnerable.push(dep);
      }
    });

    const recommendations: string[] = [];

    if (vulnerable.length > 0) {
      recommendations.push(`Found ${vulnerable.length} potentially vulnerable dependencies - run 'npm audit'`);
    }

    if (warnings.length > 0) {
      recommendations.push(`Found ${warnings.length} dependencies that may need updates`);
    }

    recommendations.push("Run 'npm outdated' to check for newer versions");
    recommendations.push("Run 'npm audit' to check for security vulnerabilities");
    recommendations.push("Consider running 'npm update' to update dependencies");

    return {
      total,
      outdated: warnings.length,
      vulnerable: vulnerable.length,
      recommendations,
      critical: vulnerable,
      warnings,
    };
  } catch (error) {
    return {
      total: 0,
      outdated: 0,
      vulnerable: 0,
      recommendations: [`Error reading package.json: ${error instanceof Error ? error.message : String(error)}`],
      critical: [],
      warnings: [],
    };
  }
}

/**
 * Generate dependency summary for agent prompts
 */
export function generateDependencySummary(): string {
  const audit = analyzeDependencies();

  let summary = "\n## DEPENDENCY STATUS\n\n";
  summary += `Total Dependencies: ${audit.total}\n`;
  summary += `Potentially Outdated: ${audit.outdated}\n`;
  summary += `Security Vulnerabilities: ${audit.vulnerable}\n`;

  if (audit.critical.length > 0) {
    summary += "\n🚨 Critical Issues:\n";
    audit.critical.slice(0, 5).forEach(dep => {
      summary += `   - ${dep.name} (${dep.current})\n`;
    });
    if (audit.critical.length > 5) {
      summary += `   ... and ${audit.critical.length - 5} more\n`;
    }
  }

  if (audit.warnings.length > 0 && audit.warnings.length <= 10) {
    summary += "\n⚠️ Dependencies to Review:\n";
    audit.warnings.slice(0, 10).forEach(dep => {
      summary += `   - ${dep.name} (${dep.current})\n`;
    });
  }

  if (audit.recommendations.length > 0) {
    summary += "\n💡 Recommendations:\n";
    audit.recommendations.forEach(rec => {
      summary += `   - ${rec}\n`;
    });
  }

  return summary;
}

export default {
  analyzeDependencies,
  generateDependencySummary,
};
