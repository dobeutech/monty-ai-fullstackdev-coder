#!/usr/bin/env node
/**
 * detect-skill-overlap.ts
 *
 * Scans installed skills and flags pairs whose descriptions, names, or
 * trigger keywords overlap above a configurable threshold.  Helps catch
 * "skill cannibalization" — multiple skills competing to handle the same
 * prompt — which degrades activation accuracy.
 *
 * Usage:
 *   npx tsx .claude/scripts/detect-skill-overlap.ts \
 *     --skills-root "$APPDATA/Claude/local-agent-mode-sessions" \
 *     --threshold 0.35 \
 *     --out overlap-report.md
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const ARG = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

const SKILLS_ROOT = ARG('skills-root', process.env.APPDATA
  ? join(process.env.APPDATA, 'Claude', 'local-agent-mode-sessions')
  : join(process.env.HOME || '', '.claude', 'skills'));
const THRESHOLD = parseFloat(ARG('threshold', '0.35') || '0.35');
const OUT = ARG('out', 'overlap-report.md');

interface Skill {
  name: string;
  description: string;
  filePath: string;
  tokens: Set<string>;
}

const STOP = new Set(['the','a','an','and','or','but','of','in','on','for','to','with',
  'by','is','are','was','were','be','been','being','use','using','when','user','wants',
  'this','that','these','those','it','its','also','can','should','will','would','must',
  'do','not','no','from','as','at','any','all','each','into','via','your','their','our',
  'how','what','which','who','where','why','then','so','up','down','out','about','over',
  'under','very','just','only','most','more','less','few','many','etc','eg','ie','vs',
  'help','wants','skill','tool','triggers','trigger','include','includes']);

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

function tokenize(s: string): Set<string> {
  const tokens = (s.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || [])
    .filter(t => !STOP.has(t) && t.length >= 4);
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return inter / union;
}

function frontmatter(md: string): Record<string, string> | null {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

console.error(`[detect-skill-overlap] scanning ${SKILLS_ROOT}`);
const files = walk(SKILLS_ROOT!);
const skills: Skill[] = [];

for (const f of files) {
  let md: string;
  try { md = readFileSync(f, 'utf-8'); } catch { continue; }
  const fm = frontmatter(md);
  if (!fm?.name || !fm?.description) continue;
  skills.push({
    name: fm.name,
    description: fm.description,
    filePath: f,
    tokens: tokenize(fm.description + ' ' + fm.name),
  });
}

console.error(`[detect-skill-overlap] parsed ${skills.length} skills`);

interface Pair {
  a: Skill;
  b: Skill;
  score: number;
  shared: string[];
  category: 'critical' | 'major' | 'minor';
}

const pairs: Pair[] = [];
for (let i = 0; i < skills.length; i++) {
  for (let j = i + 1; j < skills.length; j++) {
    const score = jaccard(skills[i].tokens, skills[j].tokens);
    if (score < THRESHOLD) continue;
    const shared = Array.from(skills[i].tokens).filter(t => skills[j].tokens.has(t));
    let category: Pair['category'] = 'minor';
    if (score >= 0.6) category = 'critical';
    else if (score >= 0.45) category = 'major';
    pairs.push({ a: skills[i], b: skills[j], score, shared, category });
  }
}

pairs.sort((x, y) => y.score - x.score);

let report = `# Skill Overlap Report\n\n`;
report += `**Scanned:** ${skills.length} skills | **Threshold:** ${THRESHOLD} | **Pairs flagged:** ${pairs.length}\n\n`;

if (pairs.length === 0) {
  report += `No overlap above threshold. Skill catalog is well-differentiated.\n`;
} else {
  report += `## Findings\n\n`;
  for (const cat of ['critical', 'major', 'minor'] as const) {
    const subset = pairs.filter(p => p.category === cat);
    if (subset.length === 0) continue;
    report += `### ${cat.toUpperCase()} (${subset.length})\n\n`;
    for (const p of subset) {
      report += `#### ${p.a.name}  vs  ${p.b.name}  —  Jaccard ${p.score.toFixed(2)}\n\n`;
      report += `- **Shared tokens:** ${p.shared.slice(0, 12).join(', ')}\n`;
      report += `- **A description:** ${p.a.description.slice(0, 140)}...\n`;
      report += `- **B description:** ${p.b.description.slice(0, 140)}...\n`;
      report += `- **Recommendation:** ${
        cat === 'critical' ? 'Consolidate or sharply differentiate descriptions with negative triggers.' :
        cat === 'major' ? 'Add "Do NOT use for..." negative triggers to one or both.' :
        'Monitor — minor overlap may be acceptable if scopes are clearly distinct.'
      }\n\n`;
    }
  }
}

writeFileSync(OUT!, report);
console.error(`[detect-skill-overlap] wrote ${OUT}`);
console.log(report);
