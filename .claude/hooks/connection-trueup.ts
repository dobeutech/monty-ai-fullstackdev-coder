#!/usr/bin/env node
/**
 * connection-trueup.ts
 *
 * SessionStart hook implementing CLAUDE.md's "Connection Catalog Check":
 *   - Auth/credentials present (Claude Code OAuth, ANTHROPIC_API_KEY conflict)
 *   - Git available + repo state
 *   - Node + npm versions
 *   - .env completeness vs .env.example
 *   - .agent/state.json exists and is recent (<48h)
 *   - Project's known MCP servers reachable (best-effort check)
 *
 * Output: a markdown banner injected into the session, surfacing anything
 * that would silently break a long-running build.
 */
import { readFileSync, existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

interface Hit {
  level: 'ok' | 'warn' | 'fail' | 'info';
  label: string;
  detail?: string;
}

const hits: Hit[] = [];
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function tryExec(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function fileAge(path: string): number | null {
  try { return Date.now() - statSync(path).mtimeMs; } catch { return null; }
}

// --- 1. Auth conflict ------------------------------------------------------

if (process.env.ANTHROPIC_API_KEY) {
  hits.push({
    level: 'warn',
    label: 'ANTHROPIC_API_KEY is set',
    detail: 'API key takes precedence over Max-subscription OAuth. Unset it (or remove from shell rc) and run /login if you intended to use the subscription.',
  });
} else {
  hits.push({ level: 'ok', label: 'No ANTHROPIC_API_KEY conflict' });
}

// --- 2. Git --------------------------------------------------------------

const gitVersion = tryExec('git --version');
if (!gitVersion) {
  hits.push({ level: 'fail', label: 'git not found on PATH' });
} else {
  const branch = tryExec('git -C "' + projectDir + '" symbolic-ref --short HEAD');
  if (!branch) {
    hits.push({ level: 'warn', label: 'Detached HEAD or not a git repo', detail: projectDir });
  } else {
    const dirty = tryExec('git -C "' + projectDir + '" status --porcelain');
    const dirtyCount = dirty ? dirty.split('\n').filter(Boolean).length : 0;
    hits.push({
      level: dirtyCount > 20 ? 'warn' : 'ok',
      label: `Git: branch ${branch}, ${dirtyCount} dirty file(s)`,
    });
  }
}

// --- 3. Node + npm --------------------------------------------------------

const nodeVer = tryExec('node --version');
const npmVer = tryExec('npm --version');
if (!nodeVer) hits.push({ level: 'warn', label: 'node not found on PATH' });
else hits.push({ level: 'ok', label: `node ${nodeVer} / npm ${npmVer || '?'}` });

// --- 4. .env vs .env.example ---------------------------------------------

const envExample = join(projectDir, '.env.example');
const envFile = join(projectDir, '.env');
const envLocal = join(projectDir, '.env.local');
if (existsSync(envExample)) {
  const required = readFileSync(envExample, 'utf-8')
    .split('\n')
    .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
    .map(l => l.split('=')[0].trim());

  const haveEnv = existsSync(envFile) ? readFileSync(envFile, 'utf-8') : '';
  const haveLocal = existsSync(envLocal) ? readFileSync(envLocal, 'utf-8') : '';
  const present = new Set<string>();
  for (const line of (haveEnv + '\n' + haveLocal).split('\n')) {
    if (line && !line.trim().startsWith('#') && line.includes('=')) {
      present.add(line.split('=')[0].trim());
    }
  }
  const missing = required.filter(r => !present.has(r));
  if (missing.length === 0) {
    hits.push({ level: 'ok', label: `.env complete (${required.length} keys vs .env.example)` });
  } else {
    hits.push({
      level: 'warn',
      label: `.env missing ${missing.length} key(s)`,
      detail: missing.slice(0, 6).join(', ') + (missing.length > 6 ? ', ...' : ''),
    });
  }
} else {
  hits.push({ level: 'info', label: 'No .env.example found — skipping env check' });
}

// --- 5. .agent/state.json recency ----------------------------------------

const statePath = join(projectDir, '.agent', 'state.json');
const ageMs = fileAge(statePath);
if (ageMs === null) {
  hits.push({ level: 'info', label: '.agent/state.json absent — first run or pipeline not initialized' });
} else {
  const hours = Math.round(ageMs / 3600000);
  if (hours > 48) {
    hits.push({ level: 'warn', label: `.agent/state.json is ${hours}h old`, detail: 'Run checkpoint.ts to refresh.' });
  } else {
    hits.push({ level: 'ok', label: `.agent/state.json fresh (${hours}h)` });
  }
}

// --- 6. Connector signals (best-effort, non-blocking) -------------------

// Composio: env var or local config
if (process.env.COMPOSIO_API_KEY || existsSync(join(process.env.HOME || process.env.USERPROFILE || '', '.composio'))) {
  hits.push({ level: 'ok', label: 'Composio credentials detected' });
} else {
  hits.push({ level: 'info', label: 'Composio credentials not detected (env var or ~/.composio)' });
}

// Claude Code credentials (Windows + POSIX paths)
const ccCreds = [
  join(process.env.APPDATA || '', 'claude', 'credentials.json'),
  join(process.env.HOME || '', '.config', 'claude', 'credentials.json'),
];
const ccFound = ccCreds.find(p => p && existsSync(p));
if (ccFound) hits.push({ level: 'ok', label: 'Claude Code OAuth credentials present', detail: ccFound });
else hits.push({ level: 'warn', label: 'Claude Code OAuth credentials not found — run /login if you expect Max-sub auth' });

// --- output ----------------------------------------------------------------

const fail = hits.filter(h => h.level === 'fail');
const warn = hits.filter(h => h.level === 'warn');
const ok   = hits.filter(h => h.level === 'ok');
const info = hits.filter(h => h.level === 'info');

let banner = '━━━━━━━━━━━━━━━━━━━━\n';
banner += `SESSION START — CONNECTION TRUE-UP\n`;
banner += '━━━━━━━━━━━━━━━━━━━━\n';
banner += `Status: ${fail.length} fail | ${warn.length} warn | ${ok.length} ok | ${info.length} info\n\n`;

if (fail.length > 0) {
  banner += 'BLOCKERS:\n';
  for (const h of fail) banner += `  X ${h.label}${h.detail ? ' — ' + h.detail : ''}\n`;
  banner += '\n';
}
if (warn.length > 0) {
  banner += 'WARNINGS:\n';
  for (const h of warn) banner += `  ! ${h.label}${h.detail ? ' — ' + h.detail : ''}\n`;
  banner += '\n';
}
if (ok.length > 0) {
  banner += 'OK:\n';
  for (const h of ok) banner += `  + ${h.label}${h.detail ? ' — ' + h.detail : ''}\n`;
  banner += '\n';
}
if (info.length > 0) {
  banner += 'INFO:\n';
  for (const h of info) banner += `  . ${h.label}${h.detail ? ' — ' + h.detail : ''}\n`;
  banner += '\n';
}

if (fail.length === 0 && warn.length === 0) {
  banner += 'All systems nominal. Begin work.\n';
} else {
  banner += 'Address blockers/warnings before starting long-running work.\n';
}
banner += '━━━━━━━━━━━━━━━━━━━━\n';

console.log(banner);
process.exit(0);
