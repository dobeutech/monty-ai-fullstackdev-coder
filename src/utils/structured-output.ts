/**
 * Structured Output Validation (Feature A5)
 * Ensures consistent JSON output format across sessions
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Session output schema for consistent reporting
 */
export interface SessionOutput {
  session_id: string;
  timestamp: string;
  duration_seconds: number;
  status: 'success' | 'partial' | 'failed' | 'interrupted';

  // Progress tracking
  features: {
    total: number;
    completed: number;
    in_progress: string[];
    failed: string[];
  };

  // Actions taken
  actions: {
    files_created: string[];
    files_modified: string[];
    files_deleted: string[];
    commands_executed: string[];
    tests_run: number;
    tests_passed: number;
  };

  // Context for next session
  next_session: {
    recommended_feature: string | null;
    blockers: string[];
    notes: string[];
    skip_tools: string[];
    priority_tools: string[];
  };

  // Metrics
  metrics: {
    tokens_input: number;
    tokens_output: number;
    api_calls: number;
    estimated_cost_usd: number;
  };
}

/**
 * Tool applicability result
 */
export interface ToolApplicability {
  tool: string;
  applicable: boolean;
  reason: string;
  priority: 'high' | 'medium' | 'low' | 'skip';
}

/**
 * Session notation for agent continuity
 */
export interface SessionNotation {
  session_id: string;
  ended_at: string;

  // What was accomplished
  summary: string;
  features_completed: string[];

  // What to do next
  next_steps: string[];
  recommended_feature: string | null;

  // Tool optimization
  tools_used: string[];
  tools_skipped: string[];
  tool_recommendations: ToolApplicability[];

  // Blockers and issues
  blockers: string[];
  warnings: string[];

  // Context to preserve
  important_context: string[];
  file_changes: { path: string; action: 'created' | 'modified' | 'deleted' }[];
}

/**
 * Create default session output
 */
export function createSessionOutput(sessionId: string): SessionOutput {
  return {
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    duration_seconds: 0,
    status: 'success',
    features: {
      total: 0,
      completed: 0,
      in_progress: [],
      failed: [],
    },
    actions: {
      files_created: [],
      files_modified: [],
      files_deleted: [],
      commands_executed: [],
      tests_run: 0,
      tests_passed: 0,
    },
    next_session: {
      recommended_feature: null,
      blockers: [],
      notes: [],
      skip_tools: [],
      priority_tools: [],
    },
    metrics: {
      tokens_input: 0,
      tokens_output: 0,
      api_calls: 0,
      estimated_cost_usd: 0,
    },
  };
}

/**
 * Validate session output against schema
 */
export function validateSessionOutput(output: unknown): output is SessionOutput {
  if (typeof output !== 'object' || output === null) return false;

  const o = output as Record<string, unknown>;

  return (
    typeof o.session_id === 'string' &&
    typeof o.timestamp === 'string' &&
    typeof o.duration_seconds === 'number' &&
    ['success', 'partial', 'failed', 'interrupted'].includes(o.status as string) &&
    typeof o.features === 'object' &&
    typeof o.actions === 'object' &&
    typeof o.next_session === 'object' &&
    typeof o.metrics === 'object'
  );
}

/**
 * Save session output to file
 */
export function saveSessionOutput(agentDir: string, output: SessionOutput): void {
  const outputPath = join(agentDir, 'session_output.json');
  const historyPath = join(agentDir, 'session_history.json');

  // Save current output
  writeFileSync(outputPath, JSON.stringify(output, null, 2));

  // Append to history
  let history: SessionOutput[] = [];
  if (existsSync(historyPath)) {
    try {
      history = JSON.parse(readFileSync(historyPath, 'utf-8'));
    } catch {
      history = [];
    }
  }

  // Keep last 50 sessions
  history.push(output);
  if (history.length > 50) {
    history = history.slice(-50);
  }

  writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

/**
 * Load last session output
 */
export function loadLastSessionOutput(agentDir: string): SessionOutput | null {
  const outputPath = join(agentDir, 'session_output.json');

  if (!existsSync(outputPath)) return null;

  try {
    const data = JSON.parse(readFileSync(outputPath, 'utf-8'));
    return validateSessionOutput(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Create session notation for next agent
 */
export function createSessionNotation(
  sessionId: string,
  summary: string,
  toolRecommendations: ToolApplicability[]
): SessionNotation {
  return {
    session_id: sessionId,
    ended_at: new Date().toISOString(),
    summary,
    features_completed: [],
    next_steps: [],
    recommended_feature: null,
    tools_used: [],
    tools_skipped: [],
    tool_recommendations: toolRecommendations,
    blockers: [],
    warnings: [],
    important_context: [],
    file_changes: [],
  };
}

/**
 * Save session notation
 */
export function saveSessionNotation(agentDir: string, notation: SessionNotation): void {
  const notationPath = join(agentDir, 'session_notation.json');
  const historyPath = join(agentDir, 'notation_history.json');

  writeFileSync(notationPath, JSON.stringify(notation, null, 2));

  // Append to history
  let history: SessionNotation[] = [];
  if (existsSync(historyPath)) {
    try {
      history = JSON.parse(readFileSync(historyPath, 'utf-8'));
    } catch {
      history = [];
    }
  }

  history.push(notation);
  if (history.length > 20) {
    history = history.slice(-20);
  }

  writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

/**
 * Load last session notation
 */
export function loadLastSessionNotation(agentDir: string): SessionNotation | null {
  const notationPath = join(agentDir, 'session_notation.json');

  if (!existsSync(notationPath)) return null;

  try {
    return JSON.parse(readFileSync(notationPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Generate output format schema for SDK
 */
export function getOutputFormatSchema(): object {
  return {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        status: { type: 'string', enum: ['success', 'partial', 'failed', 'interrupted'] },
        features_completed: { type: 'array', items: { type: 'string' } },
        next_recommended: { type: 'string' },
        blockers: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' },
      },
      required: ['session_id', 'status', 'summary'],
    },
  };
}

export default {
  createSessionOutput,
  validateSessionOutput,
  saveSessionOutput,
  loadLastSessionOutput,
  createSessionNotation,
  saveSessionNotation,
  loadLastSessionNotation,
  getOutputFormatSchema,
};
