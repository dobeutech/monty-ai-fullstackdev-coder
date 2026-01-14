/**
 * Supabase Setup Utilities
 * Autonomous workflow for detecting and setting up Supabase backend infrastructure.
 * Based on Anthropic's best practices for long-running agents.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { agentConfig } from "../config/agent-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Check if Supabase credentials are configured
 */
export interface SupabaseConfig {
  url: string | null;
  anonKey: string | null;
  configured: boolean;
}

export function checkSupabaseConfig(): SupabaseConfig {
  // Check for .env file in project root
  const projectRoot = agentConfig.paths.projectRoot;
  const envPath = resolve(projectRoot, ".env");
  
  let url: string | null = null;
  let anonKey: string | null = null;

  if (existsSync(envPath)) {
    try {
      const envContent = readFileSync(envPath, "utf-8");
      const lines = envContent.split("\n");
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const eqIndex = trimmed.indexOf("=");
          if (eqIndex > 0) {
            const key = trimmed.substring(0, eqIndex).trim();
            const value = trimmed.substring(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
            
            if (key === "VITE_SUPABASE_URL") {
              url = value;
            } else if (key === "VITE_SUPABASE_ANON_KEY") {
              anonKey = value;
            }
          }
        }
      }
    } catch (error) {
      // Silently fail - env file might not be readable
    }
  }

  return {
    url,
    anonKey,
    configured: !!(url && anonKey && url !== "placeholder" && anonKey !== "placeholder"),
  };
}

/**
 * Find migration files in the project
 */
export interface MigrationFile {
  path: string;
  name: string;
  timestamp: string;
}

export function findMigrationFiles(): MigrationFile[] {
  const projectRoot = agentConfig.paths.projectRoot;
  const migrationsDir = resolve(projectRoot, "supabase", "migrations");
  
  if (!existsSync(migrationsDir)) {
    return [];
  }

  try {
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith(".sql"))
      .map(f => ({
        path: join(migrationsDir, f),
        name: f,
        timestamp: extractTimestamp(f),
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return files;
  } catch (error) {
    return [];
  }
}

/**
 * Extract timestamp from migration filename
 * Formats: YYYYMMDDHHMMSS or YYYYMMDDHHMMSS_*
 */
function extractTimestamp(filename: string): string {
  // Match patterns like: 20251119020909_*.sql or 20251119020909.sql
  const match = filename.match(/^(\d{14})/);
  return match ? match[1] : filename;
}

/**
 * Check if Supabase CLI is available
 */
export function checkSupabaseCLI(): boolean {
  // This would require running a command, so we'll return a hint
  // The agent should check this by running: supabase --version
  return false; // Placeholder - actual check happens via bash
}

/**
 * Generate a setup report
 */
export interface SetupReport {
  config: SupabaseConfig;
  migrations: MigrationFile[];
  cliAvailable: boolean;
  recommendations: string[];
}

export function generateSetupReport(): SetupReport {
  const config = checkSupabaseConfig();
  const migrations = findMigrationFiles();
  const cliAvailable = checkSupabaseCLI();
  
  const recommendations: string[] = [];

  if (!config.configured) {
    recommendations.push("Configure Supabase credentials in .env file (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)");
  } else if (migrations.length > 0) {
    recommendations.push(`Found ${migrations.length} migration files - check if they need to be applied`);
    recommendations.push("Run: supabase db push (if Supabase CLI is installed)");
    recommendations.push("Or apply migrations manually via Supabase dashboard SQL editor");
  }

  if (migrations.length === 0 && config.configured) {
    recommendations.push("No migration files found - database may already be set up");
  }

  return {
    config,
    migrations,
    cliAvailable,
    recommendations,
  };
}

/**
 * Get a summary string for the agent prompt
 */
export function getSetupSummary(): string {
  const report = generateSetupReport();
  
  let summary = "\n## SUPABASE BACKEND STATUS\n\n";
  
  if (report.config.configured) {
    summary += "✅ Supabase credentials configured\n";
    summary += `   URL: ${report.config.url}\n`;
  } else {
    summary += "❌ Supabase credentials not configured\n";
    summary += "   Missing: VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY\n";
  }

  if (report.migrations.length > 0) {
    summary += `\n📁 Found ${report.migrations.length} migration files:\n`;
    report.migrations.slice(0, 5).forEach(m => {
      summary += `   - ${m.name}\n`;
    });
    if (report.migrations.length > 5) {
      summary += `   ... and ${report.migrations.length - 5} more\n`;
    }
  } else {
    summary += "\n📁 No migration files found\n";
  }

  if (report.recommendations.length > 0) {
    summary += "\n💡 Recommendations:\n";
    report.recommendations.forEach(r => {
      summary += `   - ${r}\n`;
    });
  }

  return summary;
}

export default {
  checkSupabaseConfig,
  findMigrationFiles,
  checkSupabaseCLI,
  generateSetupReport,
  getSetupSummary,
};
