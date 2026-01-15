/**
 * Usage Monitor (Feature B5)
 * Track API costs, token usage, and session metrics
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { writeFileSync, readFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';

/**
 * Token pricing (USD per 1M tokens) - Claude 3.5 Sonnet
 */
export const TOKEN_PRICING = {
  'claude-3-5-sonnet': {
    input: 3.00,   // $3 per 1M input tokens
    output: 15.00, // $15 per 1M output tokens
  },
  'claude-3-opus': {
    input: 15.00,  // $15 per 1M input tokens
    output: 75.00, // $75 per 1M output tokens
  },
  'claude-3-haiku': {
    input: 0.25,   // $0.25 per 1M input tokens
    output: 1.25,  // $1.25 per 1M output tokens
  },
  default: {
    input: 3.00,
    output: 15.00,
  },
};

/**
 * Usage entry for a single API call
 */
export interface UsageEntry {
  timestamp: string;
  session_id: string;
  model: string;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  tool_used?: string;
  duration_ms?: number;
}

/**
 * Session usage summary
 */
export interface SessionUsage {
  session_id: string;
  started_at: string;
  ended_at?: string;
  total_tokens_input: number;
  total_tokens_output: number;
  total_cost_usd: number;
  api_calls: number;
  tools_used: Record<string, number>;
  model: string;
}

/**
 * Daily usage summary
 */
export interface DailyUsage {
  date: string;
  total_tokens_input: number;
  total_tokens_output: number;
  total_cost_usd: number;
  sessions: number;
  api_calls: number;
}

/**
 * Usage tracker state
 */
interface UsageState {
  current_session: SessionUsage | null;
  daily_totals: Record<string, DailyUsage>;
  all_time_totals: {
    tokens_input: number;
    tokens_output: number;
    cost_usd: number;
    sessions: number;
    api_calls: number;
  };
}

/**
 * Calculate cost for token usage
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string = 'default'
): number {
  const pricing = TOKEN_PRICING[model as keyof typeof TOKEN_PRICING] || TOKEN_PRICING.default;

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return Math.round((inputCost + outputCost) * 10000) / 10000; // Round to 4 decimal places
}

/**
 * Load usage state from file
 */
function loadUsageState(agentDir: string): UsageState {
  const statePath = join(agentDir, 'usage_state.json');

  if (!existsSync(statePath)) {
    return {
      current_session: null,
      daily_totals: {},
      all_time_totals: {
        tokens_input: 0,
        tokens_output: 0,
        cost_usd: 0,
        sessions: 0,
        api_calls: 0,
      },
    };
  }

  try {
    return JSON.parse(readFileSync(statePath, 'utf-8'));
  } catch {
    return {
      current_session: null,
      daily_totals: {},
      all_time_totals: {
        tokens_input: 0,
        tokens_output: 0,
        cost_usd: 0,
        sessions: 0,
        api_calls: 0,
      },
    };
  }
}

/**
 * Save usage state to file
 */
function saveUsageState(agentDir: string, state: UsageState): void {
  const statePath = join(agentDir, 'usage_state.json');
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/**
 * Start tracking a new session
 */
export function startSession(agentDir: string, sessionId: string, model: string = 'claude-3-5-sonnet'): void {
  const state = loadUsageState(agentDir);

  state.current_session = {
    session_id: sessionId,
    started_at: new Date().toISOString(),
    total_tokens_input: 0,
    total_tokens_output: 0,
    total_cost_usd: 0,
    api_calls: 0,
    tools_used: {},
    model,
  };

  state.all_time_totals.sessions++;

  saveUsageState(agentDir, state);
}

/**
 * Record an API call
 */
export function recordUsage(
  agentDir: string,
  inputTokens: number,
  outputTokens: number,
  tool?: string,
  durationMs?: number
): void {
  const state = loadUsageState(agentDir);

  if (!state.current_session) {
    console.warn('No active session to record usage');
    return;
  }

  const cost = calculateCost(inputTokens, outputTokens, state.current_session.model);

  // Update session
  state.current_session.total_tokens_input += inputTokens;
  state.current_session.total_tokens_output += outputTokens;
  state.current_session.total_cost_usd += cost;
  state.current_session.api_calls++;

  if (tool) {
    state.current_session.tools_used[tool] = (state.current_session.tools_used[tool] || 0) + 1;
  }

  // Update all-time totals
  state.all_time_totals.tokens_input += inputTokens;
  state.all_time_totals.tokens_output += outputTokens;
  state.all_time_totals.cost_usd += cost;
  state.all_time_totals.api_calls++;

  // Update daily totals
  const today = new Date().toISOString().split('T')[0]!;
  if (!state.daily_totals[today]) {
    state.daily_totals[today] = {
      date: today,
      total_tokens_input: 0,
      total_tokens_output: 0,
      total_cost_usd: 0,
      sessions: 0,
      api_calls: 0,
    };
  }

  state.daily_totals[today].total_tokens_input += inputTokens;
  state.daily_totals[today].total_tokens_output += outputTokens;
  state.daily_totals[today].total_cost_usd += cost;
  state.daily_totals[today].api_calls++;

  saveUsageState(agentDir, state);

  // Also append to log
  const entry: UsageEntry = {
    timestamp: new Date().toISOString(),
    session_id: state.current_session.session_id,
    model: state.current_session.model,
    tokens_input: inputTokens,
    tokens_output: outputTokens,
    cost_usd: cost,
    tool_used: tool,
    duration_ms: durationMs,
  };

  const logPath = join(agentDir, 'usage_log.jsonl');
  appendFileSync(logPath, JSON.stringify(entry) + '\n');
}

/**
 * End the current session
 */
export function endSession(agentDir: string): SessionUsage | null {
  const state = loadUsageState(agentDir);

  if (!state.current_session) {
    return null;
  }

  state.current_session.ended_at = new Date().toISOString();

  // Update daily session count
  const today = new Date().toISOString().split('T')[0]!;
  if (state.daily_totals[today]) {
    state.daily_totals[today].sessions++;
  }

  const completedSession = { ...state.current_session };

  // Save session to history
  const historyPath = join(agentDir, 'session_usage_history.json');
  let history: SessionUsage[] = [];
  if (existsSync(historyPath)) {
    try {
      history = JSON.parse(readFileSync(historyPath, 'utf-8'));
    } catch {
      history = [];
    }
  }
  history.push(completedSession);
  if (history.length > 100) {
    history = history.slice(-100);
  }
  writeFileSync(historyPath, JSON.stringify(history, null, 2));

  state.current_session = null;
  saveUsageState(agentDir, state);

  return completedSession;
}

/**
 * Get current session usage
 */
export function getCurrentSessionUsage(agentDir: string): SessionUsage | null {
  const state = loadUsageState(agentDir);
  return state.current_session;
}

/**
 * Get all-time usage totals
 */
export function getAllTimeTotals(agentDir: string): UsageState['all_time_totals'] {
  const state = loadUsageState(agentDir);
  return state.all_time_totals;
}

/**
 * Get daily usage for a specific date or last N days
 */
export function getDailyUsage(agentDir: string, days: number = 7): DailyUsage[] {
  const state = loadUsageState(agentDir);

  const sortedDays = Object.values(state.daily_totals)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days);

  return sortedDays;
}

/**
 * Get usage summary report
 */
export function getUsageSummary(agentDir: string): string {
  const state = loadUsageState(agentDir);
  const today = new Date().toISOString().split('T')[0]!;
  const todayUsage = state.daily_totals[today];

  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║                     USAGE SUMMARY                           ║',
    '╠══════════════════════════════════════════════════════════════╣',
  ];

  // Current session
  if (state.current_session) {
    lines.push('║ Current Session:                                             ║');
    lines.push(`║   Tokens: ${state.current_session.total_tokens_input.toLocaleString()} in / ${state.current_session.total_tokens_output.toLocaleString()} out`.padEnd(63) + '║');
    lines.push(`║   Cost: $${state.current_session.total_cost_usd.toFixed(4)}`.padEnd(63) + '║');
    lines.push(`║   API Calls: ${state.current_session.api_calls}`.padEnd(63) + '║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');
  }

  // Today
  if (todayUsage) {
    lines.push('║ Today:                                                       ║');
    lines.push(`║   Tokens: ${todayUsage.total_tokens_input.toLocaleString()} in / ${todayUsage.total_tokens_output.toLocaleString()} out`.padEnd(63) + '║');
    lines.push(`║   Cost: $${todayUsage.total_cost_usd.toFixed(4)}`.padEnd(63) + '║');
    lines.push(`║   Sessions: ${todayUsage.sessions} | API Calls: ${todayUsage.api_calls}`.padEnd(63) + '║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');
  }

  // All time
  lines.push('║ All Time:                                                    ║');
  lines.push(`║   Tokens: ${state.all_time_totals.tokens_input.toLocaleString()} in / ${state.all_time_totals.tokens_output.toLocaleString()} out`.padEnd(63) + '║');
  lines.push(`║   Cost: $${state.all_time_totals.cost_usd.toFixed(4)}`.padEnd(63) + '║');
  lines.push(`║   Sessions: ${state.all_time_totals.sessions} | API Calls: ${state.all_time_totals.api_calls}`.padEnd(63) + '║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

/**
 * Estimate remaining budget usage
 */
export function estimateBudgetUsage(
  agentDir: string,
  budgetUsd: number
): { used: number; remaining: number; percentUsed: number } {
  const totals = getAllTimeTotals(agentDir);
  const used = totals.cost_usd;
  const remaining = Math.max(0, budgetUsd - used);
  const percentUsed = (used / budgetUsd) * 100;

  return { used, remaining, percentUsed };
}

/**
 * Get burn rate (cost per hour) based on recent sessions
 */
export function getBurnRate(agentDir: string, hoursLookback: number = 24): number {
  const logPath = join(agentDir, 'usage_log.jsonl');

  if (!existsSync(logPath)) return 0;

  try {
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    const cutoff = new Date(Date.now() - hoursLookback * 60 * 60 * 1000);
    let totalCost = 0;

    for (const line of lines) {
      const entry = JSON.parse(line) as UsageEntry;
      if (new Date(entry.timestamp) >= cutoff) {
        totalCost += entry.cost_usd;
      }
    }

    return totalCost / hoursLookback;
  } catch {
    return 0;
  }
}

export default {
  calculateCost,
  startSession,
  recordUsage,
  endSession,
  getCurrentSessionUsage,
  getAllTimeTotals,
  getDailyUsage,
  getUsageSummary,
  estimateBudgetUsage,
  getBurnRate,
  TOKEN_PRICING,
};
