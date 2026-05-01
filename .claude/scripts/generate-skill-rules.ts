#!/usr/bin/env node
/**
 * generate-skill-rules.ts
 *
 * Scans installed Claude Code skills (plugin and personal) and emits a
 * skill-rules.json fragment with auto-extracted keyword and intent triggers.
 *
 * Usage:
 *   npx tsx .claude/scripts/generate-skill-rules.ts \
 *     --skills-root "$APPDATA/Claude/local-agent-mode-sessions" \
 *     --out .claude/skills/skill-rules.generated.json
 *
 * Then diff against the canonical skill-rules.json and merge selectively.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

interface PromptTriggers {
  keywords: string[];
  intentPatterns: string[];
}
interface SkillRule {
  type: 'domain' | 'guardrail';
  enforcement: 'suggest' | 'warn' | 'block';
  priority: 'critical' | 'high' | 'medium' | 'low';
  promptTriggers: PromptTriggers;
}
interface SkillRules { version: string; skills: Record<string, SkillRule>; }

interface ParsedSkill {
  name: string;
  description: string;
  archetype: 'guardrail' | 'domain';
  filePath: string;
}

const ARG = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

const SKILLS_ROOT = ARG('skills-root', process.env.APPDATA
  ? join(process.env.APPDATA, 'Claude', 'local-agent-mode-sessions')
  : join(process.env.HOME || '', '.claude', 'skills'));
const OUT = ARG('out', '.claude/skills/skill-rules.generated.json');
const MAX_KEYWORDS = parseInt(ARG('max-keywords', '8') || '8', 10);

// --- helpers ---------------------------------------------------------------

function walkSkillFiles(root: string, depth = 0): string[] {
  if (!existsSync(root) || depth > 8) return [];
  const out: string[] = [];
  try {
    for (const entry of readdirSync(root)) {
      const p = join(root, entry);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) {
        out.push(...walkSkillFiles(p, depth + 1));
      } else if (entry === 'SKILL.md') {
        out.push(p);
      }
    }
  } catch { /* permission denied — skip */ }
  return out;
}

function parseFrontmatter(md: string): Record<string, string> | null {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const STOPWORDS = new Set([
  'the','a','an','and','or','but','if','of','in','on','for','to','with','by',
  'is','are','was','were','be','been','being','use','using','when','user','wants',
  'this','that','these','those','it','its','also','can','should','will','would',
  'must','may','might','do','not','no','yes','from','as','at','any','all','each',
  'into','via','your','their','our','my','i','you','he','she','they','we','them',
  'how','what','which','who','where','why','than','then','so','up','down','out',
  'about','over','under','very','just','only','most','more','less','few','many',
  'mention','mentions','also','help','wants','etc','eg','ie','vs','via','per',
  'skill','tool','use','using','triggers','trigger','include','includes','etc'
]);

function extractKeywords(desc: string, max: number): string[] {
  // Pull quoted phrases first ("alt text", "alt-page", "vs page")
  const quoted = Array.from(desc.matchAll(/['"]([^'"]{2,30})['"]/g))
    .map(m => m[1].toLowerCase().trim())
    .filter(s => s.length > 1 && !STOPWORDS.has(s));

  // Then high-signal nouns: words that look like file extensions, file types,
  // hyphenated terms, or proper-cased multi-letter tokens.
  const tokens = (desc.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || [])
    .filter(t => !STOPWORDS.has(t) && t.length >= 3);

  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);

  const ranked = Array.from(freq.entries())
    .filter(([, c]) => c >= 1)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);

  // Combine quoted phrases (highest priority) with ranked tokens, dedupe.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of [...quoted, ...ranked]) {
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

function extractIntentPatterns(desc: string): string[] {
  // Heuristic: look for "create a ___", "build a ___", "fix ___", "audit ___"
  // verb phrases in the description.
  const verbs = ['create','build','design','generate','write','review','audit',
    'optimize','optimise','fix','debug','migrate','convert','improve','rewrite',
    'extract','merge','split','plan','scaffold','deploy','test'];
  const found = new Set<string>();
  for (const v of verbs) {
    const re = new RegExp(`\\b${v}[a-z]*\\b[^.]{0,30}`, 'gi');
    const matches = desc.match(re);
    if (matches) {
      for (const m of matches.slice(0, 2)) {
        const cleaned = m.toLowerCase().trim().replace(/[^a-z .*-]/g, '').slice(0, 30);
        if (cleaned.length > 4) found.add(`${v}.*` + cleaned.split(' ').slice(1, 3).join('.*'));
      }
    }
  }
  return Array.from(found).slice(0, 4);
}

function inferArchetype(desc: string): 'domain' | 'guardrail' {
  const guardrailHints = ['safety','security','validate','validation','review','enforce',
    'lint','audit','secret','credential','before completion','do not','must not'];
  const lower = desc.toLowerCase();
  return guardrailHints.some(h => lower.includes(h)) ? 'guardrail' : 'domain';
}

function inferPriority(desc: string, archetype: 'domain' | 'guardrail'): SkillRule['priority'] {
  const lower = desc.toLowerCase();
  if (archetype === 'guardrail' && /(security|secret|credential|production)/.test(lower)) return 'critical';
  if (/(must|always|critical|required)/.test(lower)) return 'high';
  if (/(consider|optional|nice to)/.test(lower)) return 'low';
  return 'medium';
}

// --- main ------------------------------------------------------------------

console.error(`[generate-skill-rules] scanning ${SKILLS_ROOT}`);
const files = walkSkillFiles(SKILLS_ROOT!);
console.error(`[generate-skill-rules] found ${files.length} SKILL.md files`);

const parsed: ParsedSkill[] = [];
for (const file of files) {
  let content: string;
  try { content = readFileSync(file, 'utf-8'); } catch { continue; }
  const fm = parseFrontmatter(content);
  if (!fm || !fm.name || !fm.description) continue;
  const archetype = inferArchetype(fm.description);
  parsed.push({
    name: fm.name,
    description: fm.description,
    archetype,
    filePath: file,
  });
}

console.error(`[generate-skill-rules] parsed ${parsed.length} valid skills`);

const rules: SkillRules = { version: '1.0.0', skills: {} };
for (const skill of parsed) {
  const keywords = extractKeywords(skill.description, MAX_KEYWORDS);
  const intentPatterns = extractIntentPatterns(skill.description);
  if (keywords.length === 0 && intentPatterns.length === 0) continue;
  rules.skills[skill.name] = {
    type: skill.archetype,
    enforcement: skill.archetype === 'guardrail' ? 'warn' : 'suggest',
    priority: inferPriority(skill.description, skill.archetype),
    promptTriggers: { keywords, intentPatterns },
  };
}

writeFileSync(OUT!, JSON.stringify(rules, null, 2));
console.error(`[generate-skill-rules] wrote ${Object.keys(rules.skills).length} rules to ${OUT}`);
