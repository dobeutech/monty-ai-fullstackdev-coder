/**
 * Hooks Manager (Features A2, B4)
 * Security guards, TDD enforcement, audit logging, notifications
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join, dirname, basename } from 'path';

/**
 * Hook event types
 */
export type HookEventType =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SubagentStop'
  | 'PreCompact'
  | 'SessionStart'
  | 'SessionEnd';

/**
 * Hook result actions
 */
export type HookAction = 'allow' | 'deny' | 'continue' | 'modify';

/**
 * Hook input data
 */
export interface HookInput {
  hook_event_name: HookEventType;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  session_id?: string;
  timestamp: string;
}

/**
 * Hook result
 */
export interface HookResult {
  action: HookAction;
  reason?: string;
  modified_input?: Record<string, unknown>;
  inject_message?: string;
}

/**
 * Hook function signature
 */
export type HookFunction = (input: HookInput, context: HookContext) => Promise<HookResult>;

/**
 * Hook context
 */
export interface HookContext {
  project_root: string;
  agent_dir: string;
  session_id: string;
  feature_in_progress?: string;
}

/**
 * Hook matcher configuration
 */
export interface HookMatcher {
  matcher: string | RegExp;
  hooks: HookFunction[];
}

/**
 * Hooks configuration
 */
export interface HooksConfig {
  PreToolUse?: HookMatcher[];
  PostToolUse?: HookMatcher[];
  PostToolUseFailure?: HookMatcher[];
  UserPromptSubmit?: HookFunction[];
  Stop?: HookFunction[];
  SubagentStop?: HookFunction[];
  PreCompact?: HookFunction[];
  SessionStart?: HookFunction[];
  SessionEnd?: HookFunction[];
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  timestamp: string;
  session_id: string;
  event: HookEventType;
  tool?: string;
  action: HookAction;
  details: string;
}

// ============================================================================
// Security Hooks
// ============================================================================

/**
 * Block dangerous bash commands
 */
export const blockDangerousCommands: HookFunction = async (input, _context) => {
  if (input.tool_name !== 'Bash') {
    return { action: 'continue' };
  }

  const command = (input.tool_input?.command as string) || '';

  // Dangerous patterns
  const dangerousPatterns = [
    /rm\s+-rf\s+\/(?!\w)/,           // rm -rf / (but allow rm -rf /path)
    /rm\s+-rf\s+~\//,                 // rm -rf ~/
    /rm\s+-rf\s+\$HOME/,              // rm -rf $HOME
    />\s*\/dev\/sd[a-z]/,             // Write to disk devices
    /mkfs\./,                          // Format filesystems
    /dd\s+if=.*of=\/dev/,             // dd to devices
    /:(){ :|:& };:/,                  // Fork bomb
    /wget.*\|\s*sh/,                  // Download and execute
    /curl.*\|\s*sh/,                  // Download and execute
    /chmod\s+777\s+\//,               // chmod 777 on root
    /chown\s+-R\s+.*\s+\//,           // chown -R on root
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return {
        action: 'deny',
        reason: `Dangerous command blocked: matches pattern ${pattern.toString()}`,
      };
    }
  }

  // Block commands that modify system files
  const systemPaths = ['/etc/', '/usr/', '/bin/', '/sbin/', '/boot/', '/sys/', '/proc/'];
  for (const path of systemPaths) {
    if (command.includes(`> ${path}`) || command.includes(`rm ${path}`)) {
      return {
        action: 'deny',
        reason: `Cannot modify system path: ${path}`,
      };
    }
  }

  return { action: 'continue' };
};

/**
 * Block writes to protected files
 */
export const blockProtectedFiles: HookFunction = async (input, _context) => {
  if (!['Write', 'Edit'].includes(input.tool_name || '')) {
    return { action: 'continue' };
  }

  const filePath = (input.tool_input?.file_path as string) || '';

  // Protected patterns
  const protectedPatterns = [
    /\.env\.production$/,
    /\.env\.local$/,
    /credentials\.json$/,
    /secrets\.json$/,
    /\.ssh\//,
    /\.gnupg\//,
    /\.aws\/credentials$/,
    /\.kube\/config$/,
  ];

  for (const pattern of protectedPatterns) {
    if (pattern.test(filePath)) {
      return {
        action: 'deny',
        reason: `Cannot modify protected file: ${filePath}`,
      };
    }
  }

  return { action: 'continue' };
};

/**
 * Prevent accidental git force push
 */
export const preventForcePush: HookFunction = async (input, _context) => {
  if (input.tool_name !== 'Bash') {
    return { action: 'continue' };
  }

  const command = (input.tool_input?.command as string) || '';

  if (/git\s+push\s+.*(-f|--force)/.test(command)) {
    // Check if pushing to main/master
    if (/\s+(main|master)\s*$/.test(command) || /origin\s+(main|master)/.test(command)) {
      return {
        action: 'deny',
        reason: 'Force push to main/master is blocked. Use a feature branch instead.',
      };
    }
  }

  return { action: 'continue' };
};

// ============================================================================
// TDD Guard Hooks (Feature B4)
// ============================================================================

/**
 * Enforce Test-Driven Development
 */
export const tddGuard: HookFunction = async (input, context) => {
  if (input.tool_name !== 'Edit') {
    return { action: 'continue' };
  }

  const filePath = (input.tool_input?.file_path as string) || '';

  // Check if this is an implementation file (not a test)
  const isImplementationFile =
    /\.(ts|tsx|js|jsx)$/.test(filePath) &&
    !filePath.includes('.test.') &&
    !filePath.includes('.spec.') &&
    !filePath.includes('__tests__') &&
    !filePath.includes('/test/');

  if (!isImplementationFile) {
    return { action: 'continue' };
  }

  // Check if corresponding test file exists
  const testPatterns = [
    filePath.replace(/\.(ts|tsx|js|jsx)$/, '.test.$1'),
    filePath.replace(/\.(ts|tsx|js|jsx)$/, '.spec.$1'),
    filePath.replace(/\/src\//, '/__tests__/').replace(/\.(ts|tsx|js|jsx)$/, '.test.$1'),
  ];

  let testExists = false;
  for (const testPath of testPatterns) {
    const fullTestPath = join(context.project_root, testPath);
    if (existsSync(fullTestPath)) {
      testExists = true;
      break;
    }
  }

  // Also check for test directory
  const testDirPath = join(context.project_root, 'test', basename(filePath).replace(/\.(ts|tsx|js|jsx)$/, '.test.$1'));
  if (existsSync(testDirPath)) {
    testExists = true;
  }

  if (!testExists) {
    return {
      action: 'deny',
      reason: `TDD Guard: Write tests first! No test file found for ${filePath}. Create a test file before modifying implementation.`,
      inject_message: `[TDD REMINDER] Before editing ${basename(filePath)}, please create a corresponding test file.`,
    };
  }

  return { action: 'continue' };
};

/**
 * Relaxed TDD guard (warns but doesn't block)
 */
export const tddGuardWarn: HookFunction = async (input, context) => {
  const result = await tddGuard(input, context);

  if (result.action === 'deny') {
    return {
      action: 'continue',
      inject_message: `[TDD WARNING] ${result.reason}`,
    };
  }

  return result;
};

// ============================================================================
// Audit Logging Hooks
// ============================================================================

/**
 * Log all tool usage
 */
export const auditToolUsage: HookFunction = async (input, context) => {
  const logPath = join(context.agent_dir, 'audit_log.jsonl');

  const entry: AuditLogEntry = {
    timestamp: input.timestamp,
    session_id: context.session_id,
    event: input.hook_event_name,
    tool: input.tool_name,
    action: 'allow',
    details: JSON.stringify(input.tool_input || {}),
  };

  try {
    appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch {
    // Silently fail - don't block on logging errors
  }

  return { action: 'continue' };
};

/**
 * Log file changes
 */
export const auditFileChanges: HookFunction = async (input, context) => {
  if (!['Write', 'Edit'].includes(input.tool_name || '')) {
    return { action: 'continue' };
  }

  const logPath = join(context.agent_dir, 'file_changes.log');
  const filePath = input.tool_input?.file_path as string;
  const action = input.tool_name === 'Write' ? 'WRITE' : 'EDIT';

  const logEntry = `[${input.timestamp}] ${action}: ${filePath}\n`;

  try {
    appendFileSync(logPath, logEntry);
  } catch {
    // Silently fail
  }

  return { action: 'continue' };
};

// ============================================================================
// Session Hooks
// ============================================================================

/**
 * Initialize session logging
 */
export const sessionStartLogger: HookFunction = async (input, context) => {
  const logPath = join(context.agent_dir, 'sessions.log');
  const entry = `[${input.timestamp}] SESSION START: ${context.session_id}\n`;

  try {
    appendFileSync(logPath, entry);
  } catch {
    // Silently fail
  }

  return { action: 'continue' };
};

/**
 * Finalize session logging
 */
export const sessionEndLogger: HookFunction = async (input, context) => {
  const logPath = join(context.agent_dir, 'sessions.log');
  const entry = `[${input.timestamp}] SESSION END: ${context.session_id}\n`;

  try {
    appendFileSync(logPath, entry);
  } catch {
    // Silently fail
  }

  return { action: 'continue' };
};

// ============================================================================
// Hook Runner
// ============================================================================

/**
 * Run hooks for a specific event
 */
export async function runHooks(
  event: HookEventType,
  input: Omit<HookInput, 'hook_event_name' | 'timestamp'>,
  context: HookContext,
  config: HooksConfig
): Promise<HookResult> {
  const fullInput: HookInput = {
    ...input,
    hook_event_name: event,
    timestamp: new Date().toISOString(),
  };

  // Get hooks for this event
  const eventHooks = config[event];
  if (!eventHooks || eventHooks.length === 0) {
    return { action: 'continue' };
  }

  // For tool events, filter by matcher
  if (['PreToolUse', 'PostToolUse', 'PostToolUseFailure'].includes(event)) {
    const matchers = eventHooks as HookMatcher[];

    for (const matcher of matchers) {
      const toolName = input.tool_name || '';
      const matches =
        typeof matcher.matcher === 'string'
          ? new RegExp(matcher.matcher).test(toolName)
          : matcher.matcher.test(toolName);

      if (matches) {
        for (const hook of matcher.hooks) {
          const result = await hook(fullInput, context);

          if (result.action === 'deny') {
            return result;
          }

          if (result.action === 'modify' && result.modified_input) {
            fullInput.tool_input = result.modified_input;
          }
        }
      }
    }
  } else {
    // For non-tool events, run all hooks
    const hooks = eventHooks as HookFunction[];

    for (const hook of hooks) {
      const result = await hook(fullInput, context);

      if (result.action === 'deny') {
        return result;
      }
    }
  }

  return { action: 'continue' };
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Create default hooks configuration
 */
export function createDefaultHooksConfig(options: {
  enableTDD?: boolean;
  enableAudit?: boolean;
  enableSecurity?: boolean;
  strictTDD?: boolean;
} = {}): HooksConfig {
  const {
    enableTDD = true,
    enableAudit = true,
    enableSecurity = true,
    strictTDD = false,
  } = options;

  const config: HooksConfig = {
    PreToolUse: [],
    PostToolUse: [],
    SessionStart: [sessionStartLogger],
    SessionEnd: [sessionEndLogger],
  };

  // Security hooks
  if (enableSecurity) {
    config.PreToolUse!.push({
      matcher: 'Bash',
      hooks: [blockDangerousCommands, preventForcePush],
    });

    config.PreToolUse!.push({
      matcher: 'Write|Edit',
      hooks: [blockProtectedFiles],
    });
  }

  // TDD hooks
  if (enableTDD) {
    config.PreToolUse!.push({
      matcher: 'Edit',
      hooks: [strictTDD ? tddGuard : tddGuardWarn],
    });
  }

  // Audit hooks
  if (enableAudit) {
    config.PostToolUse!.push({
      matcher: '.*',
      hooks: [auditToolUsage, auditFileChanges],
    });
  }

  return config;
}

/**
 * Load audit log
 */
export function loadAuditLog(agentDir: string, limit: number = 100): AuditLogEntry[] {
  const logPath = join(agentDir, 'audit_log.jsonl');

  if (!existsSync(logPath)) {
    return [];
  }

  try {
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const entries = lines.map(line => JSON.parse(line) as AuditLogEntry);

    return entries.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Get hooks summary for SDK options
 */
export function getHooksForSDK(config: HooksConfig): object {
  // Convert our config to SDK format
  const sdkHooks: Record<string, unknown[]> = {};

  if (config.PreToolUse) {
    sdkHooks.PreToolUse = config.PreToolUse.map(m => ({
      matcher: typeof m.matcher === 'string' ? m.matcher : m.matcher.source,
      hooks: m.hooks.map(h => h.name || 'anonymous'),
    }));
  }

  return sdkHooks;
}

export default {
  blockDangerousCommands,
  blockProtectedFiles,
  preventForcePush,
  tddGuard,
  tddGuardWarn,
  auditToolUsage,
  auditFileChanges,
  sessionStartLogger,
  sessionEndLogger,
  runHooks,
  createDefaultHooksConfig,
  loadAuditLog,
  getHooksForSDK,
};
