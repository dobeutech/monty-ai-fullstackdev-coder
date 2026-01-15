/**
 * Session Manager (Features A1, A6)
 * Handles session persistence, resumption, and file checkpointing
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname, relative } from 'path';
import { createHash } from 'crypto';

/**
 * Session state for persistence
 */
export interface SessionState {
  session_id: string;
  parent_session_id: string | null;
  created_at: string;
  last_active: string;
  status: 'active' | 'completed' | 'interrupted' | 'forked';

  // Context preservation
  current_feature: string | null;
  completed_features: string[];
  failed_features: string[];

  // Conversation context (summary for long sessions)
  context_summary: string;
  important_decisions: string[];

  // Tool state
  tools_initialized: string[];
  mcp_servers_active: string[];

  // Checkpoints
  checkpoints: CheckpointInfo[];
  current_checkpoint: string | null;
}

/**
 * Checkpoint information
 */
export interface CheckpointInfo {
  id: string;
  created_at: string;
  description: string;
  feature_id: string | null;
  files_snapshot: FileSnapshot[];
  can_restore: boolean;
}

/**
 * File snapshot for checkpointing
 */
export interface FileSnapshot {
  path: string;
  hash: string;
  size: number;
  backed_up: boolean;
}

/**
 * Generate unique session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
}

/**
 * Generate checkpoint ID
 */
export function generateCheckpointId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `ckpt-${timestamp}-${random}`;
}

/**
 * Create new session state
 */
export function createSessionState(parentSessionId: string | null = null): SessionState {
  return {
    session_id: generateSessionId(),
    parent_session_id: parentSessionId,
    created_at: new Date().toISOString(),
    last_active: new Date().toISOString(),
    status: 'active',
    current_feature: null,
    completed_features: [],
    failed_features: [],
    context_summary: '',
    important_decisions: [],
    tools_initialized: [],
    mcp_servers_active: [],
    checkpoints: [],
    current_checkpoint: null,
  };
}

/**
 * Save session state
 */
export function saveSessionState(agentDir: string, state: SessionState): void {
  const sessionPath = join(agentDir, 'session_state.json');
  const sessionsDir = join(agentDir, 'sessions');

  // Ensure sessions directory exists
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }

  // Update last active
  state.last_active = new Date().toISOString();

  // Save current state
  writeFileSync(sessionPath, JSON.stringify(state, null, 2));

  // Also save to sessions history
  const historyPath = join(sessionsDir, `${state.session_id}.json`);
  writeFileSync(historyPath, JSON.stringify(state, null, 2));
}

/**
 * Load session state
 */
export function loadSessionState(agentDir: string): SessionState | null {
  const sessionPath = join(agentDir, 'session_state.json');

  if (!existsSync(sessionPath)) return null;

  try {
    return JSON.parse(readFileSync(sessionPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Load specific session by ID
 */
export function loadSessionById(agentDir: string, sessionId: string): SessionState | null {
  const sessionsDir = join(agentDir, 'sessions');
  const sessionPath = join(sessionsDir, `${sessionId}.json`);

  if (!existsSync(sessionPath)) return null;

  try {
    return JSON.parse(readFileSync(sessionPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Fork session for A/B testing
 */
export function forkSession(agentDir: string, parentState: SessionState): SessionState {
  const newState = createSessionState(parentState.session_id);

  // Copy relevant state from parent
  newState.completed_features = [...parentState.completed_features];
  newState.context_summary = parentState.context_summary;
  newState.important_decisions = [...parentState.important_decisions];
  newState.checkpoints = [...parentState.checkpoints];
  newState.current_checkpoint = parentState.current_checkpoint;

  // Mark parent as forked
  parentState.status = 'forked';
  saveSessionState(agentDir, parentState);

  // Save new session
  saveSessionState(agentDir, newState);

  return newState;
}

/**
 * List all sessions
 */
export function listSessions(agentDir: string): SessionState[] {
  const sessionsDir = join(agentDir, 'sessions');

  if (!existsSync(sessionsDir)) return [];

  const sessions: SessionState[] = [];
  const files = readdirSync(sessionsDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const state = JSON.parse(readFileSync(join(sessionsDir, file), 'utf-8'));
      sessions.push(state);
    } catch {
      // Skip invalid files
    }
  }

  // Sort by last active (newest first)
  return sessions.sort((a, b) =>
    new Date(b.last_active).getTime() - new Date(a.last_active).getTime()
  );
}

/**
 * Calculate file hash
 */
function calculateFileHash(filePath: string): string {
  if (!existsSync(filePath)) return '';

  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Create checkpoint
 */
export function createCheckpoint(
  agentDir: string,
  projectRoot: string,
  description: string,
  featureId: string | null = null
): CheckpointInfo {
  const checkpointsDir = join(agentDir, 'checkpoints');
  const checkpointId = generateCheckpointId();
  const checkpointDir = join(checkpointsDir, checkpointId);

  // Create checkpoint directory
  mkdirSync(checkpointDir, { recursive: true });

  // Find tracked files (src, config files, etc.)
  const trackedPatterns = [
    'src/**/*.ts',
    'src/**/*.tsx',
    'src/**/*.js',
    'src/**/*.jsx',
    'package.json',
    'tsconfig.json',
    '.env',
    '.env.local',
  ];

  const files: FileSnapshot[] = [];

  // Simple file discovery (would use glob in production)
  const srcDir = join(projectRoot, 'src');
  if (existsSync(srcDir)) {
    const srcFiles = findFilesRecursive(srcDir, ['.ts', '.tsx', '.js', '.jsx']);
    for (const file of srcFiles) {
      const relativePath = relative(projectRoot, file);
      const hash = calculateFileHash(file);
      const stats = statSync(file);

      // Backup file
      const backupPath = join(checkpointDir, relativePath);
      const backupDir = dirname(backupPath);
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
      }
      copyFileSync(file, backupPath);

      files.push({
        path: relativePath,
        hash,
        size: stats.size,
        backed_up: true,
      });
    }
  }

  // Backup config files
  const configFiles = ['package.json', 'tsconfig.json'];
  for (const configFile of configFiles) {
    const filePath = join(projectRoot, configFile);
    if (existsSync(filePath)) {
      const hash = calculateFileHash(filePath);
      const stats = statSync(filePath);

      copyFileSync(filePath, join(checkpointDir, configFile));

      files.push({
        path: configFile,
        hash,
        size: stats.size,
        backed_up: true,
      });
    }
  }

  const checkpoint: CheckpointInfo = {
    id: checkpointId,
    created_at: new Date().toISOString(),
    description,
    feature_id: featureId,
    files_snapshot: files,
    can_restore: true,
  };

  // Save checkpoint metadata
  writeFileSync(
    join(checkpointDir, 'checkpoint.json'),
    JSON.stringify(checkpoint, null, 2)
  );

  return checkpoint;
}

/**
 * Restore checkpoint
 */
export function restoreCheckpoint(
  agentDir: string,
  projectRoot: string,
  checkpointId: string
): boolean {
  const checkpointDir = join(agentDir, 'checkpoints', checkpointId);
  const metadataPath = join(checkpointDir, 'checkpoint.json');

  if (!existsSync(metadataPath)) {
    console.error(`Checkpoint ${checkpointId} not found`);
    return false;
  }

  try {
    const checkpoint: CheckpointInfo = JSON.parse(readFileSync(metadataPath, 'utf-8'));

    if (!checkpoint.can_restore) {
      console.error(`Checkpoint ${checkpointId} cannot be restored`);
      return false;
    }

    // Restore each file
    for (const file of checkpoint.files_snapshot) {
      if (file.backed_up) {
        const backupPath = join(checkpointDir, file.path);
        const targetPath = join(projectRoot, file.path);

        if (existsSync(backupPath)) {
          const targetDir = dirname(targetPath);
          if (!existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
          }
          copyFileSync(backupPath, targetPath);
        }
      }
    }

    console.log(`Restored checkpoint: ${checkpoint.description}`);
    return true;
  } catch (error) {
    console.error(`Failed to restore checkpoint: ${error}`);
    return false;
  }
}

/**
 * List checkpoints
 */
export function listCheckpoints(agentDir: string): CheckpointInfo[] {
  const checkpointsDir = join(agentDir, 'checkpoints');

  if (!existsSync(checkpointsDir)) return [];

  const checkpoints: CheckpointInfo[] = [];
  const dirs = readdirSync(checkpointsDir);

  for (const dir of dirs) {
    const metadataPath = join(checkpointsDir, dir, 'checkpoint.json');
    if (existsSync(metadataPath)) {
      try {
        checkpoints.push(JSON.parse(readFileSync(metadataPath, 'utf-8')));
      } catch {
        // Skip invalid checkpoints
      }
    }
  }

  // Sort by creation time (newest first)
  return checkpoints.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Clean old checkpoints (keep last N)
 */
export function cleanOldCheckpoints(agentDir: string, keepCount: number = 10): void {
  const checkpoints = listCheckpoints(agentDir);

  if (checkpoints.length <= keepCount) return;

  const toDelete = checkpoints.slice(keepCount);
  const checkpointsDir = join(agentDir, 'checkpoints');

  for (const checkpoint of toDelete) {
    const checkpointDir = join(checkpointsDir, checkpoint.id);
    if (existsSync(checkpointDir)) {
      // Remove directory recursively
      removeDirectoryRecursive(checkpointDir);
    }
  }
}

/**
 * Helper: Find files recursively
 */
function findFilesRecursive(dir: string, extensions: string[]): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules and hidden directories
      if (!entry.startsWith('.') && entry !== 'node_modules' && entry !== 'dist') {
        files.push(...findFilesRecursive(fullPath, extensions));
      }
    } else if (extensions.some(ext => entry.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Helper: Remove directory recursively
 */
function removeDirectoryRecursive(dir: string): void {
  if (!existsSync(dir)) return;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      removeDirectoryRecursive(fullPath);
    } else {
      unlinkSync(fullPath);
    }
  }

  // Remove empty directory
  try {
    readdirSync(dir).length === 0 && unlinkSync(dir);
  } catch {
    // Ignore errors
  }
}

/**
 * Get session resume options for SDK
 */
export function getResumeOptions(sessionState: SessionState): object {
  return {
    resume: sessionState.session_id,
    context_summary: sessionState.context_summary,
    completed_features: sessionState.completed_features,
  };
}

/**
 * Generate session summary for context preservation
 */
export function generateSessionSummary(state: SessionState): string {
  const completedCount = state.completed_features.length;
  const failedCount = state.failed_features.length;

  let summary = `Session ${state.session_id}\n`;
  summary += `Started: ${state.created_at}\n`;
  summary += `Features completed: ${completedCount}\n`;

  if (failedCount > 0) {
    summary += `Features failed: ${failedCount}\n`;
  }

  if (state.current_feature) {
    summary += `Currently working on: ${state.current_feature}\n`;
  }

  if (state.important_decisions.length > 0) {
    summary += `\nKey decisions:\n`;
    for (const decision of state.important_decisions) {
      summary += `- ${decision}\n`;
    }
  }

  return summary;
}

export default {
  generateSessionId,
  createSessionState,
  saveSessionState,
  loadSessionState,
  loadSessionById,
  forkSession,
  listSessions,
  createCheckpoint,
  restoreCheckpoint,
  listCheckpoints,
  cleanOldCheckpoints,
  getResumeOptions,
  generateSessionSummary,
};
