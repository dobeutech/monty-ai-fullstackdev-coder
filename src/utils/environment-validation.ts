/**
 * Environment Validation Utilities
 * Validates environment variables, configuration files, and required setup.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { agentConfig } from "../config/agent-config.js";

/**
 * Environment validation result
 */
export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
  warnings: string[];
  recommendations: string[];
}

/**
 * Validate environment variables from .env file
 */
export function validateEnvironment(): EnvValidationResult {
  const root = agentConfig.paths.projectRoot;
  const envPath = resolve(root, ".env");
  const envExamplePath = resolve(root, ".env.example");

  const result: EnvValidationResult = {
    valid: true,
    missing: [],
    invalid: [],
    warnings: [],
    recommendations: [],
  };

  // Check if .env file exists
  if (!existsSync(envPath)) {
    if (existsSync(envExamplePath)) {
      result.warnings.push(".env file not found, but .env.example exists");
      result.recommendations.push("Copy .env.example to .env and fill in values");
    } else {
      result.warnings.push(".env file not found");
      result.recommendations.push("Create .env file if environment variables are needed");
    }
    return result;
  }

  // Read .env file
  try {
    const envContent = readFileSync(envPath, "utf-8");
    const lines = envContent.split("\n");
    const envVars: Record<string, string> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          const value = trimmed.substring(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
          envVars[key] = value;
        }
      }
    }

    // Check for placeholder values
    for (const [key, value] of Object.entries(envVars)) {
      if (!value || value === "placeholder" || value === "your-value-here" || value.startsWith("YOUR_")) {
        result.invalid.push(key);
        result.valid = false;
      }
    }

    // Check for common required variables based on project type
    // This is a heuristic - actual requirements depend on the project
    if (envVars["VITE_SUPABASE_URL"] && envVars["VITE_SUPABASE_ANON_KEY"]) {
      // Supabase project - check if values are valid
      if (envVars["VITE_SUPABASE_URL"] === "https://your-project.supabase.co") {
        result.invalid.push("VITE_SUPABASE_URL");
        result.valid = false;
      }
    }

  } catch (error) {
    result.warnings.push(`Error reading .env file: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * Check for required configuration files
 */
export function checkRequiredConfigs(): string[] {
  const root = agentConfig.paths.projectRoot;
  const missing: string[] = [];

  // Common config files that might be required
  const configs = [
    { file: "package.json", required: true },
    { file: "tsconfig.json", required: false },
    { file: "vite.config.ts", required: false },
    { file: "next.config.js", required: false },
    { file: "tailwind.config.js", required: false },
  ];

  for (const config of configs) {
    if (config.required && !existsSync(resolve(root, config.file))) {
      missing.push(config.file);
    }
  }

  return missing;
}

/**
 * Generate environment validation summary
 */
export function generateEnvironmentSummary(): string {
  const validation = validateEnvironment();
  const missingConfigs = checkRequiredConfigs();

  let summary = "\n## ENVIRONMENT VALIDATION\n\n";

  if (validation.valid && missingConfigs.length === 0) {
    summary += "✅ Environment configuration valid\n";
  } else {
    if (!validation.valid) {
      summary += "❌ Environment validation failed\n";
    }
    if (missingConfigs.length > 0) {
      summary += `⚠️ Missing required config files: ${missingConfigs.join(", ")}\n`;
    }
  }

  if (validation.invalid.length > 0) {
    summary += "\n🚨 Invalid Environment Variables:\n";
    validation.invalid.forEach(key => {
      summary += `   - ${key} (contains placeholder or invalid value)\n`;
    });
  }

  if (validation.warnings.length > 0) {
    summary += "\n⚠️ Warnings:\n";
    validation.warnings.forEach(warning => {
      summary += `   - ${warning}\n`;
    });
  }

  if (validation.recommendations.length > 0) {
    summary += "\n💡 Recommendations:\n";
    validation.recommendations.forEach(rec => {
      summary += `   - ${rec}\n`;
    });
  }

  return summary;
}

export default {
  validateEnvironment,
  checkRequiredConfigs,
  generateEnvironmentSummary,
};
