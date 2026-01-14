/**
 * Error Recovery Utilities
 * Provides rollback capabilities, error tracking, and recovery strategies.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { agentConfig } from "../config/agent-config.js";

/**
 * Error entry
 */
export interface ErrorEntry {
  timestamp: string;
  session: string;
  error: string;
  context: string;
  recovery: string | null;
  resolved: boolean;
}

/**
 * Session checkpoint for rollback
 */
export interface Checkpoint {
  timestamp: string;
  session: string;
  gitCommit: string | null;
  featureId: string | null;
  description: string;
  files: string[];
}

/**
 * Get error log path
 */
function getErrorLogPath(): string {
  return resolve(agentConfig.paths.agentDir, "error-log.json");
}

/**
 * Get checkpoint path
 */
function getCheckpointPath(): string {
  return resolve(agentConfig.paths.agentDir, "checkpoints.json");
}

/**
 * Ensure agent directory exists
 */
function ensureAgentDir(): void {
  if (!existsSync(agentConfig.paths.agentDir)) {
    mkdirSync(agentConfig.paths.agentDir, { recursive: true });
  }
}

/**
 * Log an error
 */
export function logError(
  error: Error | string,
  context: string,
  recovery?: string
): void {
  ensureAgentDir();

  const errorLogPath = getErrorLogPath();
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : undefined;

  const entry: ErrorEntry = {
    timestamp: new Date().toISOString(),
    session: `session-${Date.now()}`,
    error: errorMessage,
    context,
    recovery: recovery || null,
    resolved: false,
  };

  let errors: ErrorEntry[] = [];

  if (existsSync(errorLogPath)) {
    try {
      const content = readFileSync(errorLogPath, "utf-8");
      errors = JSON.parse(content);
    } catch {
      // If file is corrupted, start fresh
      errors = [];
    }
  }

  errors.push(entry);

  // Keep only last 100 errors
  if (errors.length > 100) {
    errors = errors.slice(-100);
  }

  try {
    writeFileSync(errorLogPath, JSON.stringify(errors, null, 2), "utf-8");
  } catch {
    // Silently fail if we can't write
  }
}

/**
 * Get recent errors
 */
export function getRecentErrors(limit: number = 10): ErrorEntry[] {
  const errorLogPath = getErrorLogPath();

  if (!existsSync(errorLogPath)) {
    return [];
  }

  try {
    const content = readFileSync(errorLogPath, "utf-8");
    const errors: ErrorEntry[] = JSON.parse(content);
    return errors.slice(-limit).reverse();
  } catch {
    return [];
  }
}

/**
 * Create a checkpoint
 */
export function createCheckpoint(
  session: string,
  gitCommit: string | null,
  featureId: string | null,
  description: string,
  files: string[] = []
): void {
  ensureAgentDir();

  const checkpointPath = getCheckpointPath();

  const checkpoint: Checkpoint = {
    timestamp: new Date().toISOString(),
    session,
    gitCommit,
    featureId,
    description,
    files,
  };

  let checkpoints: Checkpoint[] = [];

  if (existsSync(checkpointPath)) {
    try {
      const content = readFileSync(checkpointPath, "utf-8");
      checkpoints = JSON.parse(content);
    } catch {
      checkpoints = [];
    }
  }

  checkpoints.push(checkpoint);

  // Keep only last 50 checkpoints
  if (checkpoints.length > 50) {
    checkpoints = checkpoints.slice(-50);
  }

  try {
    writeFileSync(checkpointPath, JSON.stringify(checkpoints, null, 2), "utf-8");
  } catch {
    // Silently fail
  }
}

/**
 * Get recent checkpoints
 */
export function getRecentCheckpoints(limit: number = 5): Checkpoint[] {
  const checkpointPath = getCheckpointPath();

  if (!existsSync(checkpointPath)) {
    return [];
  }

  try {
    const content = readFileSync(checkpointPath, "utf-8");
    const checkpoints: Checkpoint[] = JSON.parse(content);
    return checkpoints.slice(-limit).reverse();
  } catch {
    return [];
  }
}

/**
 * Get the last checkpoint
 */
export function getLastCheckpoint(): Checkpoint | null {
  const checkpoints = getRecentCheckpoints(1);
  return checkpoints[0] || null;
}

/**
 * Generate error recovery summary
 */
export function generateErrorRecoverySummary(): string {
  const recentErrors = getRecentErrors(5);
  const recentCheckpoints = getRecentCheckpoints(3);

  let summary = "\n## ERROR RECOVERY STATUS\n\n";

  if (recentErrors.length > 0) {
    summary += `⚠️ Recent Errors (${recentErrors.length}):\n`;
    recentErrors.slice(0, 3).forEach(err => {
      summary += `   - ${err.error.substring(0, 60)}${err.error.length > 60 ? "..." : ""}\n`;
      summary += `     Context: ${err.context.substring(0, 50)}${err.context.length > 50 ? "..." : ""}\n`;
    });
  } else {
    summary += "✅ No recent errors logged\n";
  }

  if (recentCheckpoints.length > 0) {
    summary += `\n📌 Recent Checkpoints (${recentCheckpoints.length}):\n`;
    recentCheckpoints.forEach(cp => {
      summary += `   - ${cp.description.substring(0, 50)}${cp.description.length > 50 ? "..." : ""}\n`;
      summary += `     ${cp.timestamp}\n`;
    });
  }

  summary += "\n💡 Recovery Options:\n";
  summary += "   - Check git log for recent commits\n";
  summary += "   - Use 'git reset --hard <commit>' to rollback if needed\n";
  summary += "   - Review error-log.json for detailed error history\n";
  summary += "   - Review checkpoints.json for session checkpoints\n";

  return summary;
}

export default {
  logError,
  getRecentErrors,
  createCheckpoint,
  getRecentCheckpoints,
  getLastCheckpoint,
  generateErrorRecoverySummary,
};
