#!/usr/bin/env node
/**
 * checkpoint.ts
 *
 * Writes the canonical .agent/state.json from current git+test+build status,
 * appends a timestamped entry to .agent/progress.md, and (optionally) makes
 * a [CHECKPOINT] git commit.  Implements the checkpoint protocol from
 * CLAUDE.md and references/05-checkpoint-protocol.md.
 *
 * Usage:
 *   npx tsx .claude/scripts/checkpoint.ts \
 *     [--feature feat-042] \
 *     [--note "auth refactor complete"] \
 *     [--build "npm run build"] \
 *     [--test "npm test --silent"] \
 *     [--commit]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const ARG = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const FLAG = (k: string) => process.argv.includes(`--${k}`);

const FEATURE = ARG('feature', '');
const NOTE = ARG('note', '');
const BUILD_CMD = ARG('build', '');
const TEST_CMD = ARG('test', '');
const SHOULD_COMMIT = FLAG('commit');
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function tryExec(cmd: string, cwd = PROJECT_DIR): { ok: boolean; out: string } {
  try {
    const out = execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out.trim() };
  } catch (e: any) {
    return { ok: false, out: String(e?.stderr || e?.message || '').trim() };
  }
}

// --- gather state ----------------------------------------------------------

const now = new Date().toISOString();
const branch = tryExec('git symbolic-ref --short HEAD').out || 'detached';
const sha = tryExec('git rev-parse HEAD').out || 'none';
const shortSha = sha.slice(0, 8);
const dirty = tryExec('git status --porcelain').out;
const dirtyCount = dirty ? dirty.split('\n').filter(Boolean).length : 0;
const lastCommitMsg = tryExec('git log -1 --pretty=%s').out || '';

// Build status (only if requested — never run a build silently)
let buildStatus: { command: string; ok: boolean; tail: string } | null = null;
if (BUILD_CMD) {
  console.error(`[checkpoint] running build: ${BUILD_CMD}`);
  const r = tryExec(BUILD_CMD);
  buildStatus = { command: BUILD_CMD, ok: r.ok, tail: r.out.split('\n').slice(-5).join('\n') };
}

// Test status (only if requested)
let testStatus: { command: string; ok: boolean; tail: string } | null = null;
if (TEST_CMD) {
  console.error(`[checkpoint] running tests: ${TEST_CMD}`);
  const r = tryExec(TEST_CMD);
  testStatus = { command: TEST_CMD, ok: r.ok, tail: r.out.split('\n').slice(-10).join('\n') };
}

// Connection signals (cheap)
const connections = {
  hasComposioCreds: !!process.env.COMPOSIO_API_KEY ||
    existsSync(join(process.env.HOME || process.env.USERPROFILE || '', '.composio')),
  hasClaudeCodeCreds:
    existsSync(join(process.env.APPDATA || '', 'claude', 'credentials.json')) ||
    existsSync(join(process.env.HOME || '', '.config', 'claude', 'credentials.json')),
  anthropicApiKeySet: !!process.env.ANTHROPIC_API_KEY,
};

// Model used (best-effort, from env or default)
const model = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || 'unknown';

// --- compose state ---------------------------------------------------------

const state = {
  timestamp: now,
  workingDir: PROJECT_DIR,
  feature: FEATURE || null,
  git: {
    branch,
    sha,
    shortSha,
    dirtyFiles: dirtyCount,
    lastCommitMessage: lastCommitMsg,
  },
  build: buildStatus,
  test: testStatus,
  platform: process.platform,
  node: process.version,
  model,
  connections,
  note: NOTE || null,
  handoffNote: NOTE
    ? NOTE
    : `Branch ${branch} @ ${shortSha}${dirtyCount ? ` (${dirtyCount} dirty)` : ''}` +
      (buildStatus ? `, build ${buildStatus.ok ? 'OK' : 'FAIL'}` : '') +
      (testStatus ? `, tests ${testStatus.ok ? 'OK' : 'FAIL'}` : ''),
};

// --- write artifacts -------------------------------------------------------

const agentDir = join(PROJECT_DIR, '.agent');
if (!existsSync(agentDir)) mkdirSync(agentDir, { recursive: true });

const statePath = join(agentDir, 'state.json');
writeFileSync(statePath, JSON.stringify(state, null, 2));

const progressPath = join(agentDir, 'progress.md');
const entryHeader = FEATURE ? `## ${now} — ${FEATURE}` : `## ${now} — checkpoint`;
const entry = [
  '',
  entryHeader,
  '',
  `- Branch: \`${branch}\` @ \`${shortSha}\``,
  `- Dirty files: ${dirtyCount}`,
  buildStatus ? `- Build: ${buildStatus.ok ? 'OK' : 'FAIL'} (${buildStatus.command})` : '',
  testStatus ? `- Tests: ${testStatus.ok ? 'OK' : 'FAIL'} (${testStatus.command})` : '',
  NOTE ? `- Note: ${NOTE}` : '',
  '',
].filter(Boolean).join('\n');

if (existsSync(progressPath)) {
  const existing = readFileSync(progressPath, 'utf-8');
  writeFileSync(progressPath, existing + entry);
} else {
  writeFileSync(progressPath, '# Project Progress\n' + entry);
}

console.log(`[checkpoint] wrote ${statePath}`);
console.log(`[checkpoint] appended to ${progressPath}`);

// --- optional commit -------------------------------------------------------

if (SHOULD_COMMIT) {
  if (dirtyCount === 0) {
    console.log('[checkpoint] nothing to commit (working tree clean)');
  } else {
    const msg = `[CHECKPOINT] ${FEATURE || 'session'}${NOTE ? ' — ' + NOTE.slice(0, 60) : ''}`;
    const add = tryExec('git add -A');
    if (!add.ok) {
      console.error('[checkpoint] git add failed:', add.out);
      process.exit(1);
    }
    const commit = tryExec(`git commit -m "${msg.replace(/"/g, '\\"')}"`);
    if (commit.ok) {
      console.log(`[checkpoint] committed: ${msg}`);
    } else {
      console.error('[checkpoint] git commit failed:', commit.out);
    }
  }
}

console.log('[checkpoint] done');
