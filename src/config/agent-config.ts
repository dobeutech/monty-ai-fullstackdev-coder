/**
 * Agent Configuration
 * Central configuration for the long-running agent framework.
 * Based on Anthropic's best practices for effective agent harnesses.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { resolve } from 'path';
import { existsSync } from 'fs';

/**
 * Feature flags for optional capabilities
 */
export interface FeatureFlags {
  enableTDD: boolean;
  enableAuditLog: boolean;
  enableSecurityHooks: boolean;
  enableUsageTracking: boolean;
  enableContextPriming: boolean;
  enableFileCheckpointing: boolean;
  enableSubagents: boolean;
  strictTDD: boolean;
}

/**
 * Session configuration
 */
export interface SessionConfig {
  maxRetries: number;
  verifyBasicFunctionality: boolean;
  autoSaveCheckpoints: boolean;
  checkpointInterval: number; // features between checkpoints
  maxCheckpoints: number;
}

/**
 * Git configuration
 */
export interface GitConfig {
  autoCommit: boolean;
  commitMessagePrefix: string;
  preventForcePush: boolean;
  protectMainBranch: boolean;
}

/**
 * Full agent configuration
 */
export interface AgentConfig {
  paths: {
    agentDir: string;
    featureList: string;
    progressFile: string;
    templatesDir: string;
    projectRoot: string;
    sessionState: string;
    usageLog: string;
    auditLog: string;
    checkpointsDir: string;
  };
  tools: {
    initializer: string[];
    coding: string[];
    review: string[];
  };
  permissionMode: 'acceptEdits' | 'bypassPermissions' | 'default';
  git: GitConfig;
  session: SessionConfig;
  features: FeatureFlags;
  model: {
    default: string;
    subagents: string;
  };
}

// Get the project root (where the agent is invoked from)
const projectRoot = process.cwd();
const agentDir = resolve(projectRoot, '.agent');

/**
 * Default agent configuration
 */
export const agentConfig: AgentConfig = {
  paths: {
    agentDir,
    featureList: resolve(agentDir, 'feature_list.json'),
    progressFile: resolve(agentDir, 'claude-progress.txt'),
    templatesDir: resolve(projectRoot, 'templates'),
    projectRoot,
    sessionState: resolve(agentDir, 'session_state.json'),
    usageLog: resolve(agentDir, 'usage_log.jsonl'),
    auditLog: resolve(agentDir, 'audit_log.jsonl'),
    checkpointsDir: resolve(agentDir, 'checkpoints'),
  },
  tools: {
    // Initializer needs write access to create files
    initializer: ['Read', 'Write', 'Bash', 'Glob', 'Grep'],
    // Coding agent needs edit for incremental changes + browser for testing
    coding: ['Read', 'Edit', 'Bash', 'Glob', 'Grep', 'Browser', 'Task'],
    // Review agent needs read-only access
    review: ['Read', 'Glob', 'Grep'],
  },
  permissionMode: 'acceptEdits',
  git: {
    autoCommit: true,
    commitMessagePrefix: '[monty]',
    preventForcePush: true,
    protectMainBranch: true,
  },
  session: {
    maxRetries: 3,
    verifyBasicFunctionality: true,
    autoSaveCheckpoints: true,
    checkpointInterval: 3, // checkpoint every 3 features
    maxCheckpoints: 10,
  },
  features: {
    enableTDD: true,
    enableAuditLog: true,
    enableSecurityHooks: true,
    enableUsageTracking: true,
    enableContextPriming: true,
    enableFileCheckpointing: true,
    enableSubagents: true,
    strictTDD: false, // Set to true to block edits without tests
  },
  model: {
    default: 'claude-3-5-sonnet',
    subagents: 'claude-3-5-sonnet',
  },
};

/**
 * Get the full path for a config path relative to project root
 */
export function getAgentPath(key: keyof AgentConfig['paths']): string {
  return agentConfig.paths[key];
}

/**
 * Check if this is the first run (no .agent directory exists)
 */
export function isFirstRun(): boolean {
  return !existsSync(agentConfig.paths.agentDir);
}

/**
 * Check if project is initialized
 */
export function isProjectInitialized(): boolean {
  return existsSync(agentConfig.paths.featureList);
}

/**
 * Get tools based on project state
 */
export function getOptimizedTools(projectRoot: string): string[] {
  const tools = [...agentConfig.tools.coding];

  // Check if we need browser (has dev server scripts)
  const pkgPath = resolve(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(require('fs').readFileSync(pkgPath, 'utf-8'));
      const hasDevServer = pkg.scripts?.dev || pkg.scripts?.start;
      if (!hasDevServer) {
        // Remove Browser if no dev server
        const browserIdx = tools.indexOf('Browser');
        if (browserIdx > -1) {
          tools.splice(browserIdx, 1);
        }
      }
    } catch {
      // Keep browser by default
    }
  }

  return tools;
}

/**
 * Get SDK options based on configuration
 */
export function getSDKOptions(): object {
  return {
    permissionMode: agentConfig.permissionMode,
    maxTurns: 50,
    model: agentConfig.model.default,
    enableFileCheckpointing: agentConfig.features.enableFileCheckpointing,
  };
}

/**
 * Update feature flag at runtime
 */
export function setFeatureFlag(flag: keyof FeatureFlags, value: boolean): void {
  agentConfig.features[flag] = value;
}

/**
 * Get feature flags summary
 */
export function getFeatureFlagsSummary(): string {
  const lines: string[] = ['Feature Flags:'];
  for (const [key, value] of Object.entries(agentConfig.features)) {
    const status = value ? '✓' : '✗';
    lines.push(`  ${status} ${key}`);
  }
  return lines.join('\n');
}

export default agentConfig;
