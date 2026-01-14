/**
 * Enhanced Git Utilities
 * Provides git operations, conflict detection, branch management, and change tracking.
 */

import { existsSync } from "fs";
import { resolve } from "path";
import { agentConfig } from "../config/agent-config.js";

/**
 * Git status information
 */
export interface GitStatus {
  hasChanges: boolean;
  hasUncommittedChanges: boolean;
  hasUntrackedFiles: boolean;
  hasConflicts: boolean;
  currentBranch: string | null;
  aheadOfRemote: number;
  behindRemote: number;
  lastCommit: string | null;
  lastCommitMessage: string | null;
}

/**
 * Check if git is initialized
 */
export function isGitInitialized(): boolean {
  const root = agentConfig.paths.projectRoot;
  return existsSync(resolve(root, ".git"));
}

/**
 * Get git status summary
 * Note: This provides hints - actual status requires running git commands
 */
export function getGitStatus(): GitStatus {
  const root = agentConfig.paths.projectRoot;
  const gitDir = resolve(root, ".git");

  if (!existsSync(gitDir)) {
    return {
      hasChanges: false,
      hasUncommittedChanges: false,
      hasUntrackedFiles: false,
      hasConflicts: false,
      currentBranch: null,
      aheadOfRemote: 0,
      behindRemote: 0,
      lastCommit: null,
      lastCommitMessage: null,
    };
  }

  // We can't actually run git commands here, so we provide a structure
  // The agent should run: git status, git branch, git log, etc.
  return {
    hasChanges: true, // Unknown - agent should check
    hasUncommittedChanges: true, // Unknown - agent should check
    hasUntrackedFiles: true, // Unknown - agent should check
    hasConflicts: false, // Check for .git/MERGE_HEAD, .git/CHERRY_PICK_HEAD, etc.
    currentBranch: null, // Agent should run: git branch --show-current
    aheadOfRemote: 0, // Agent should run: git rev-list --count @{u}..HEAD
    behindRemote: 0, // Agent should run: git rev-list --count HEAD..@{u}
    lastCommit: null, // Agent should run: git log -1 --format=%H
    lastCommitMessage: null, // Agent should run: git log -1 --format=%s
  };
}

/**
 * Check for merge conflicts
 */
export function hasMergeConflicts(): boolean {
  const root = agentConfig.paths.projectRoot;
  const gitDir = resolve(root, ".git");
  
  if (!existsSync(gitDir)) {
    return false;
  }

  // Check for conflict markers
  const conflictMarkers = [
    resolve(gitDir, "MERGE_HEAD"),
    resolve(gitDir, "CHERRY_PICK_HEAD"),
    resolve(gitDir, "REBASE_HEAD"),
  ];

  return conflictMarkers.some(marker => existsSync(marker));
}

/**
 * Generate git status summary for agent prompts
 */
export function generateGitSummary(): string {
  const initialized = isGitInitialized();
  const conflicts = hasMergeConflicts();

  let summary = "\n## GIT STATUS\n\n";

  if (!initialized) {
    summary += "❌ Git not initialized\n";
    summary += "   Recommendation: Run 'git init' to initialize repository\n";
    return summary;
  }

  summary += "✅ Git repository initialized\n";

  if (conflicts) {
    summary += "🚨 Merge conflicts detected!\n";
    summary += "   Check for conflict markers (<<<<<<, =======, >>>>>>)\n";
    summary += "   Resolve conflicts before continuing\n";
  }

  summary += "\n💡 Git Commands to Run:\n";
  summary += "   - git status (check for uncommitted changes)\n";
  summary += "   - git branch --show-current (current branch)\n";
  summary += "   - git log --oneline -10 (recent commits)\n";
  summary += "   - git diff (see uncommitted changes)\n";

  return summary;
}

/**
 * Get recommended git workflow
 */
export function getGitWorkflow(): string[] {
  return [
    "Before starting work: git status",
    "After completing a feature: git add -A && git commit -m '[agent] <description>'",
    "Before ending session: Ensure all changes are committed",
    "If conflicts occur: Resolve manually, then commit",
    "Never force push to main/master branch",
  ];
}

export default {
  isGitInitialized,
  getGitStatus,
  hasMergeConflicts,
  generateGitSummary,
  getGitWorkflow,
};
