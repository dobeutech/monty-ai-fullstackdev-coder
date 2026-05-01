#!/usr/bin/env node
/**
 * skill-doctor.ts
 *
 * Health check for Claude Code skills. Validates frontmatter rules, body
 * length limits, structure conventions, and reference integrity.  Emits
 * a per-skill score and an aggregate markdown report.
 *
 * Usage:
 *   npx tsx .claude/scripts/skill-doctor.ts \
 *     --skills-root /path/to/skills \
 *     --out skill-health-report.md \
 *     [--json skill-health.json]
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';

const ARG = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

const SKILLS_ROOT = ARG('skills-root', process.env.APPDATA
  ? join(process.env.APPDATA, 'Claude', 'local-agent-mode-sessions')
  : join(process.env.HOME || '', '.claude', 'skills'));
const OUT = ARG('out', 'skill-health-report.md');
const JSON_OUT = ARG('json');

// --- types -----------------------------------------------------------------

interface Issue {
  severity: 'critical' | 'major' | 'minor' | 'info';
  rule: string;
  message: string;
}

interface SkillReport {
  name: string;
  path: string;
  score: number;       // 0-100
  wordCount: number;
  lineCount: number;
  issues: Issue[];
}

// --- helpers ---------------------------------------------------------------

function walk(root: string, depth = 0): string[] {
  if (!existsSync(root) || depth > 8) return [];
  const out: string[] = [];
  try {
    for (const e of readdirSync(root)) {
      const p = join(root, e);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) out.push(...walk(p, depth + 1));
      else if (e === 'SKILL.md') out.push(p);
    }
  } catch { /* skip */ }
  return out;
}

interface Frontmatter {
  raw: string;
  fields: Record<string, string>;
  rawLines: string[];
}

function parseFrontmatter(md: string): Frontmatter | null {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fields: Record<string, string> = {};
  const rawLines = m[1].split('\n');
  for (const line of rawLines) {
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2];
  }
  return { raw: m[1], fields, rawLines };
}

// --- validators ------------------------------------------------------------

function validateFrontmatter(fm: Frontmatter, issues: Issue[]) {
  // name: lowercase, hyphens, ≤64 chars, no "anthropic"/"claude"
  const name = (fm.fields.name || '').replace(/^["']|["']$/g, '').trim();
  if (!name) {
    issues.push({ severity: 'critical', rule: 'name-required', message: 'name field is missing or empty' });
  } else {
    if (!/^[a-z0-9-]+$/.test(name)) {
      issues.push({ severity: 'critical', rule: 'name-format',
        message: `name "${name}" must match [a-z0-9-]+ (lowercase, digits, hyphens only)` });
    }
    if (name.length > 64) {
      issues.push({ severity: 'critical', rule: 'name-length',
        message: `name "${name}" exceeds 64 characters (${name.length})` });
    }
    if (/anthropic|claude/i.test(name)) {
      issues.push({ severity: 'major', rule: 'name-reserved',
        message: `name "${name}" contains reserved word (anthropic/claude)` });
    }
  }

  // description: single-line plain string, no YAML multi-line indicators, ≤1024 chars
  const descRaw = fm.fields.description || '';
  if (!descRaw) {
    issues.push({ severity: 'critical', rule: 'description-required', message: 'description field is missing or empty' });
  } else {
    // Look at the raw line where description starts — does it start with > | >- |- ?
    const descLine = fm.rawLines.find(l => l.startsWith('description:')) || '';
    const after = descLine.replace(/^description:\s*/, '').trim();
    if (/^[>|](\-)?\s*$/.test(after)) {
      issues.push({ severity: 'critical', rule: 'description-multiline',
        message: 'description uses YAML multi-line indicator (>, |, >-, |-) — must be single-line plain string' });
    }
    if (descRaw.length > 1024) {
      issues.push({ severity: 'major', rule: 'description-length',
        message: `description is ${descRaw.length} chars; max is 1024` });
    }
    if (/<[a-z][a-z0-9]*[\s>]/i.test(descRaw)) {
      issues.push({ severity: 'major', rule: 'description-xml',
        message: 'description contains XML-like tags — strip them' });
    }
    // Heuristic: should have negative triggers for common-trigger skills
    const lower = descRaw.toLowerCase();
    if (lower.length > 200 && !/(do not use|don't use|not for|except)/i.test(descRaw)) {
      issues.push({ severity: 'minor', rule: 'no-negative-triggers',
        message: 'description has no negative triggers ("Do NOT use for...") — risk of over-triggering' });
    }
    // Heuristic: trigger phrases
    if (!/(use when|when (the )?user|trigger)/i.test(descRaw)) {
      issues.push({ severity: 'minor', rule: 'no-trigger-phrase',
        message: 'description lacks an explicit "Use when..." trigger statement' });
    }
  }

  // allowed-tools: comma-separated string, NOT YAML list
  if (fm.fields['allowed-tools'] !== undefined) {
    const at = fm.fields['allowed-tools'];
    if (at.trim() === '' || at.startsWith('-') || /^\s*\[/.test(at)) {
      issues.push({ severity: 'critical', rule: 'allowed-tools-format',
        message: 'allowed-tools must be a comma-separated string (e.g., "Read, Write, Edit"), not a YAML list' });
    }
  }
}

function validateBody(body: string, issues: Issue[]): { wordCount: number; lineCount: number } {
  const lineCount = body.split('\n').length;
  const wordCount = body.split(/\s+/).filter(Boolean).length;

  if (lineCount > 500) {
    issues.push({ severity: 'major', rule: 'body-line-limit',
      message: `body is ${lineCount} lines; recommended max is 500` });
  }
  if (wordCount > 5000) {
    issues.push({ severity: 'major', rule: 'body-word-limit',
      message: `body is ${wordCount} words; recommended max is 5000 (~2000 ideal)` });
  }
  if (lineCount > 100 && !/^##\s+/m.test(body)) {
    issues.push({ severity: 'minor', rule: 'no-toc',
      message: 'long body has no top-level section headings — consider a TOC' });
  }
  // Backslash paths (Windows-style) — should use forward slashes per skill docs
  if (/[a-zA-Z]:\\|\.\\[a-zA-Z]/.test(body)) {
    issues.push({ severity: 'minor', rule: 'backslash-paths',
      message: 'body contains backslash paths — use forward slashes for cross-platform skills' });
  }
  // Second person voice
  const youCount = (body.match(/\byou\b/gi) || []).length;
  if (youCount > Math.max(5, lineCount / 50)) {
    issues.push({ severity: 'minor', rule: 'second-person',
      message: `body uses "you" ${youCount} times — prefer imperative voice ("Run X" not "You should run X")` });
  }
  return { wordCount, lineCount };
}

function validateStructure(skillDir: string, issues: Issue[]) {
  // No README.md inside skill folder
  if (existsSync(join(skillDir, 'README.md'))) {
    issues.push({ severity: 'major', rule: 'readme-in-folder',
      message: 'README.md exists alongside SKILL.md — delete it (SKILL.md IS the readme)' });
  }
  // References should be one level deep
  const refsDir = join(skillDir, 'references');
  if (existsSync(refsDir)) {
    try {
      for (const e of readdirSync(refsDir)) {
        const p = join(refsDir, e);
        let st; try { st = statSync(p); } catch { continue; }
        if (st.isDirectory()) {
          issues.push({ severity: 'minor', rule: 'nested-references',
            message: `references/${e}/ is a subdirectory — keep references one level deep` });
        }
      }
    } catch { /* skip */ }
  }
}

function validateBrokenRefs(skillDir: string, body: string, issues: Issue[]) {
  // Look for [text](path) markdown links pointing to local files
  const linkRe = /\[[^\]]+\]\(([^)]+)\)/g;
  let m;
  while ((m = linkRe.exec(body)) !== null) {
    const target = m[1];
    if (/^https?:\/\//.test(target) || target.startsWith('#') || target.startsWith('mailto:')) continue;
    if (target.startsWith('/')) continue; // absolute, can't resolve
    const resolved = join(skillDir, target.split('#')[0]);
    if (!existsSync(resolved)) {
      issues.push({ severity: 'major', rule: 'broken-link',
        message: `broken markdown link: ${target} (resolved to ${resolved})` });
    }
  }
}

// --- scoring ---------------------------------------------------------------

function scoreFromIssues(issues: Issue[]): number {
  let score = 100;
  for (const i of issues) {
    if (i.severity === 'critical') score -= 25;
    else if (i.severity === 'major') score -= 10;
    else if (i.severity === 'minor') score -= 3;
  }
  return Math.max(0, score);
}

// --- main ------------------------------------------------------------------

console.error(`[skill-doctor] scanning ${SKILLS_ROOT}`);
const files = walk(SKILLS_ROOT!);
console.error(`[skill-doctor] found ${files.length} SKILL.md files`);

const reports: SkillReport[] = [];
for (const file of files) {
  let md: string;
  try { md = readFileSync(file, 'utf-8'); } catch { continue; }
  const fm = parseFrontmatter(md);
  const skillDir = dirname(file);
  const issues: Issue[] = [];

  if (!fm) {
    issues.push({ severity: 'critical', rule: 'no-frontmatter', message: 'SKILL.md has no YAML frontmatter' });
    reports.push({ name: basename(skillDir), path: file, score: 0, wordCount: 0, lineCount: 0, issues });
    continue;
  }

  validateFrontmatter(fm, issues);
  const body = md.replace(/^---[\s\S]*?\n---\s*\n/, '');
  const { wordCount, lineCount } = validateBody(body, issues);
  validateStructure(skillDir, issues);
  validateBrokenRefs(skillDir, body, issues);

  const name = (fm.fields.name || basename(skillDir)).replace(/^["']|["']$/g, '');
  reports.push({
    name,
    path: file,
    score: scoreFromIssues(issues),
    wordCount,
    lineCount,
    issues,
  });
}

reports.sort((a, b) => a.score - b.score);

let report = `# Skill Health Report\n\n`;
report += `**Scanned:** ${reports.length} skills | **Generated:** ${new Date().toISOString()}\n\n`;
const avgScore = reports.length ? Math.round(reports.reduce((s, r) => s + r.score, 0) / reports.length) : 0;
report += `**Average score:** ${avgScore}/100\n\n`;

const buckets = {
  failing: reports.filter(r => r.score < 50),
  needsWork: reports.filter(r => r.score >= 50 && r.score < 80),
  good: reports.filter(r => r.score >= 80 && r.score < 95),
  excellent: reports.filter(r => r.score >= 95),
};
report += `**Distribution:** ${buckets.failing.length} failing | ${buckets.needsWork.length} needs work | ${buckets.good.length} good | ${buckets.excellent.length} excellent\n\n`;

report += `## Bottom 10 (lowest scores)\n\n`;
for (const r of reports.slice(0, 10)) {
  report += `### ${r.name} — ${r.score}/100\n\n`;
  report += `- Path: \`${r.path}\`\n`;
  report += `- Body: ${r.lineCount} lines, ${r.wordCount} words\n`;
  if (r.issues.length === 0) {
    report += `- No issues.\n\n`;
    continue;
  }
  for (const sev of ['critical', 'major', 'minor', 'info'] as const) {
    const subset = r.issues.filter(i => i.severity === sev);
    if (subset.length === 0) continue;
    report += `- **${sev.toUpperCase()}:**\n`;
    for (const i of subset) report += `  - [${i.rule}] ${i.message}\n`;
  }
  report += `\n`;
}

writeFileSync(OUT!, report);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(reports, null, 2));
console.error(`[skill-doctor] wrote ${OUT}${JSON_OUT ? ` and ${JSON_OUT}` : ''}`);
console.log(report.split('\n').slice(0, 30).join('\n'));
