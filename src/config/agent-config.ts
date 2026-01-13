/**
 * Agent Configuration
 * Central configuration for the long-running agent framework.
 * Based on Anthropic's best practices for effective agent harnesses.
 */

import { resolve } from "path";

export interface AgentConfig {
  paths: {
    agentDir: string;
    featureList: string;
    progressFile: string;
    templatesDir: string;
    projectRoot: string;
  };
  tools: {
    initializer: string[];
    coding: string[];
  };
  permissionMode: 'acceptEdits' | 'bypassPermissions' | 'default';
  git: {
    autoCommit: boolean;
    commitMessagePrefix: string;
  };
  session: {
    maxRetries: number;
    verifyBasicFunctionality: boolean;
  };
}

// Get the project root (where the agent is invoked from)
const projectRoot = process.cwd();

export const agentConfig: AgentConfig = {
  paths: {
    agentDir: resolve(projectRoot, '.agent'),
    featureList: resolve(projectRoot, '.agent/feature_list.json'),
    progressFile: resolve(projectRoot, '.agent/claude-progress.txt'),
    templatesDir: resolve(projectRoot, 'templates'),
    projectRoot: projectRoot,
  },
  tools: {
    // Initializer needs write access to create files
    initializer: ['Read', 'Write', 'Bash', 'Glob'],
    // Coding agent needs edit for incremental changes + browser for testing
    coding: ['Read', 'Edit', 'Bash', 'Glob', 'Browser'],
  },
  permissionMode: 'acceptEdits',
  git: {
    autoCommit: true,
    commitMessagePrefix: '[agent]',
  },
  session: {
    maxRetries: 3,
    verifyBasicFunctionality: true,
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
  // This will be checked at runtime using fs.existsSync
  return false; // Placeholder - actual check happens in index.ts
}

export default agentConfig;
