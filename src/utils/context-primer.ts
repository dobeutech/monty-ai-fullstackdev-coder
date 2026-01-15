/**
 * Context Primer (Feature B6)
 * Systematically load project context at session start
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';

/**
 * Context section types
 */
export type ContextSection =
  | 'project_overview'
  | 'architecture'
  | 'conventions'
  | 'recent_changes'
  | 'open_issues'
  | 'dependencies'
  | 'environment'
  | 'feature_progress'
  | 'session_history'
  | 'tool_recommendations';

/**
 * Primed context result
 */
export interface PrimedContext {
  sections: Record<ContextSection, string>;
  summary: string;
  token_estimate: number;
  timestamp: string;
}

/**
 * Tool recommendation based on project analysis
 */
export interface ToolRecommendation {
  tool: string;
  priority: 'required' | 'recommended' | 'optional' | 'skip';
  reason: string;
}

/**
 * Get project overview from package.json and README
 */
function getProjectOverview(projectRoot: string): string {
  const lines: string[] = ['## Project Overview\n'];

  // Package.json
  const pkgPath = join(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      lines.push(`**Name:** ${pkg.name || 'Unknown'}`);
      lines.push(`**Version:** ${pkg.version || '0.0.0'}`);
      if (pkg.description) lines.push(`**Description:** ${pkg.description}`);

      // Scripts
      if (pkg.scripts) {
        const importantScripts = ['dev', 'build', 'test', 'lint', 'start'];
        const available = importantScripts.filter(s => pkg.scripts[s]);
        if (available.length > 0) {
          lines.push(`**Scripts:** ${available.join(', ')}`);
        }
      }
    } catch {
      lines.push('*Could not parse package.json*');
    }
  }

  // README excerpt
  const readmePath = join(projectRoot, 'README.md');
  if (existsSync(readmePath)) {
    try {
      const readme = readFileSync(readmePath, 'utf-8');
      const firstSection = readme.split('\n## ')[0];
      if (firstSection && firstSection.length < 1000) {
        lines.push('\n### README Excerpt\n');
        lines.push(firstSection.substring(0, 500));
      }
    } catch {
      // Ignore
    }
  }

  return lines.join('\n');
}

/**
 * Get architecture information from CLAUDE.md or docs
 */
function getArchitecture(projectRoot: string, agentDir: string): string {
  const lines: string[] = ['## Architecture\n'];

  // Check CLAUDE.md
  const claudeMd = join(projectRoot, 'CLAUDE.md');
  if (existsSync(claudeMd)) {
    try {
      const content = readFileSync(claudeMd, 'utf-8');
      // Extract architecture section if present
      const archMatch = content.match(/## Architecture([\s\S]*?)(?=\n## |$)/);
      if (archMatch?.[1]) {
        lines.push(archMatch[1].trim().substring(0, 1500));
      } else {
        lines.push(content.substring(0, 1000));
      }
    } catch {
      // Ignore
    }
  }

  // List key directories
  const keyDirs = ['src', 'app', 'pages', 'components', 'lib', 'utils', 'api', 'services'];
  const existingDirs = keyDirs.filter(d => existsSync(join(projectRoot, d)));

  if (existingDirs.length > 0) {
    lines.push('\n### Directory Structure');
    for (const dir of existingDirs) {
      const dirPath = join(projectRoot, dir);
      try {
        const files = readdirSync(dirPath).slice(0, 10);
        lines.push(`- **${dir}/**: ${files.join(', ')}${files.length >= 10 ? '...' : ''}`);
      } catch {
        lines.push(`- **${dir}/**`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Get coding conventions from configs
 */
function getConventions(projectRoot: string): string {
  const lines: string[] = ['## Coding Conventions\n'];

  // TypeScript config
  if (existsSync(join(projectRoot, 'tsconfig.json'))) {
    lines.push('- TypeScript enabled');
    try {
      const tsconfig = JSON.parse(readFileSync(join(projectRoot, 'tsconfig.json'), 'utf-8'));
      if (tsconfig.compilerOptions?.strict) lines.push('- Strict mode enabled');
      if (tsconfig.compilerOptions?.target) lines.push(`- Target: ${tsconfig.compilerOptions.target}`);
    } catch {
      // Ignore
    }
  }

  // ESLint
  const eslintConfigs = ['.eslintrc', '.eslintrc.js', '.eslintrc.json', 'eslint.config.js'];
  if (eslintConfigs.some(c => existsSync(join(projectRoot, c)))) {
    lines.push('- ESLint configured');
  }

  // Prettier
  const prettierConfigs = ['.prettierrc', '.prettierrc.js', '.prettierrc.json', 'prettier.config.js'];
  if (prettierConfigs.some(c => existsSync(join(projectRoot, c)))) {
    lines.push('- Prettier configured');
  }

  // Tailwind
  if (existsSync(join(projectRoot, 'tailwind.config.js')) || existsSync(join(projectRoot, 'tailwind.config.ts'))) {
    lines.push('- Tailwind CSS configured');
  }

  return lines.join('\n');
}

/**
 * Get recent git changes
 */
function getRecentChanges(projectRoot: string, days: number = 7): string {
  const lines: string[] = [`## Recent Changes (last ${days} days)\n`];

  try {
    // Recent commits
    const commits = execSync(
      `git log --oneline --since="${days} days ago" -10`,
      { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }
    ).trim();

    if (commits) {
      lines.push('### Recent Commits');
      lines.push('```');
      lines.push(commits);
      lines.push('```');
    }

    // Files changed
    const filesChanged = execSync(
      `git diff --stat HEAD~5 HEAD 2>/dev/null || echo ""`,
      { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }
    ).trim();

    if (filesChanged) {
      lines.push('\n### Files Changed');
      lines.push('```');
      lines.push(filesChanged.substring(0, 500));
      lines.push('```');
    }
  } catch {
    lines.push('*Git history not available*');
  }

  return lines.join('\n');
}

/**
 * Get feature progress from agent dir
 */
function getFeatureProgress(agentDir: string): string {
  const lines: string[] = ['## Feature Progress\n'];

  const featureListPath = join(agentDir, 'feature_list.json');
  if (!existsSync(featureListPath)) {
    lines.push('*Feature list not initialized*');
    return lines.join('\n');
  }

  try {
    const data = JSON.parse(readFileSync(featureListPath, 'utf-8'));
    const features = data.features || [];

    const total = features.length;
    const passing = features.filter((f: { passes: boolean }) => f.passes).length;
    const percentage = total > 0 ? Math.round((passing / total) * 100) : 0;

    lines.push(`**Progress:** ${passing}/${total} features passing (${percentage}%)`);

    // Next features to work on
    const nextFeatures = features
      .filter((f: { passes: boolean }) => !f.passes)
      .sort((a: { priority: number }, b: { priority: number }) => a.priority - b.priority)
      .slice(0, 3);

    if (nextFeatures.length > 0) {
      lines.push('\n### Next Features');
      for (const f of nextFeatures) {
        lines.push(`- [Priority ${f.priority}] ${f.description}`);
      }
    }

    // Categories breakdown
    const categories: Record<string, { total: number; passing: number }> = {};
    for (const f of features) {
      const cat = f.category || 'unknown';
      if (!categories[cat]) categories[cat] = { total: 0, passing: 0 };
      categories[cat].total++;
      if (f.passes) categories[cat].passing++;
    }

    lines.push('\n### By Category');
    for (const [cat, data] of Object.entries(categories)) {
      const pct = Math.round((data.passing / data.total) * 100);
      lines.push(`- ${cat}: ${data.passing}/${data.total} (${pct}%)`);
    }
  } catch {
    lines.push('*Could not parse feature list*');
  }

  return lines.join('\n');
}

/**
 * Get session history summary
 */
function getSessionHistory(agentDir: string): string {
  const lines: string[] = ['## Session History\n'];

  const progressPath = join(agentDir, 'claude-progress.txt');
  if (existsSync(progressPath)) {
    try {
      const content = readFileSync(progressPath, 'utf-8');

      // Extract last session info
      const sessions = content.split('### Session:').slice(-3);
      if (sessions.length > 0) {
        lines.push('### Recent Sessions');
        for (const session of sessions) {
          const firstLine = session.split('\n')[0]?.trim();
          if (firstLine) {
            lines.push(`- ${firstLine}`);
          }
        }
      }

      // Known issues
      const issuesMatch = content.match(/## Known Issues([\s\S]*?)(?=\n## |$)/);
      if (issuesMatch?.[1]) {
        const issues = issuesMatch[1].trim();
        if (issues && issues !== 'None at this time.') {
          lines.push('\n### Known Issues');
          lines.push(issues.substring(0, 500));
        }
      }
    } catch {
      // Ignore
    }
  }

  // Session notation
  const notationPath = join(agentDir, 'session_notation.json');
  if (existsSync(notationPath)) {
    try {
      const notation = JSON.parse(readFileSync(notationPath, 'utf-8'));
      if (notation.next_steps?.length > 0) {
        lines.push('\n### Next Steps (from last session)');
        for (const step of notation.next_steps.slice(0, 5)) {
          lines.push(`- ${step}`);
        }
      }
      if (notation.blockers?.length > 0) {
        lines.push('\n### Blockers');
        for (const blocker of notation.blockers) {
          lines.push(`- ${blocker}`);
        }
      }
    } catch {
      // Ignore
    }
  }

  return lines.join('\n');
}

/**
 * Generate tool recommendations based on project
 */
function getToolRecommendations(projectRoot: string, agentDir: string): ToolRecommendation[] {
  const recommendations: ToolRecommendation[] = [];

  // Always need Read, Edit, Bash, Glob
  recommendations.push({ tool: 'Read', priority: 'required', reason: 'Core file reading' });
  recommendations.push({ tool: 'Edit', priority: 'required', reason: 'Core file editing' });
  recommendations.push({ tool: 'Bash', priority: 'required', reason: 'Command execution' });
  recommendations.push({ tool: 'Glob', priority: 'required', reason: 'File discovery' });

  // Check for browser testing need
  const hasFeatureList = existsSync(join(agentDir, 'feature_list.json'));
  if (hasFeatureList) {
    recommendations.push({ tool: 'Browser', priority: 'required', reason: 'Feature verification' });
  }

  // Check for Grep need based on codebase size
  try {
    const srcDir = join(projectRoot, 'src');
    if (existsSync(srcDir)) {
      const fileCount = countFilesRecursive(srcDir);
      if (fileCount > 20) {
        recommendations.push({ tool: 'Grep', priority: 'recommended', reason: `Large codebase (${fileCount} files)` });
      } else {
        recommendations.push({ tool: 'Grep', priority: 'optional', reason: 'Small codebase' });
      }
    }
  } catch {
    recommendations.push({ tool: 'Grep', priority: 'optional', reason: 'Default' });
  }

  // WebSearch for external docs
  const hasDependencies = existsSync(join(projectRoot, 'package.json'));
  if (hasDependencies) {
    recommendations.push({ tool: 'WebSearch', priority: 'optional', reason: 'External documentation' });
  }

  return recommendations;
}

/**
 * Helper: count files recursively
 */
function countFilesRecursive(dir: string): number {
  let count = 0;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        count += countFilesRecursive(fullPath);
      } else {
        count++;
      }
    }
  } catch {
    // Ignore
  }
  return count;
}

/**
 * Estimate token count for text
 */
function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Prime context for a session
 */
export function primeContext(
  projectRoot: string,
  agentDir: string,
  options: {
    includeSections?: ContextSection[];
    maxTokens?: number;
  } = {}
): PrimedContext {
  const {
    includeSections = [
      'project_overview',
      'architecture',
      'conventions',
      'recent_changes',
      'feature_progress',
      'session_history',
      'tool_recommendations',
    ],
    maxTokens = 8000,
  } = options;

  const sections: Record<ContextSection, string> = {
    project_overview: '',
    architecture: '',
    conventions: '',
    recent_changes: '',
    open_issues: '',
    dependencies: '',
    environment: '',
    feature_progress: '',
    session_history: '',
    tool_recommendations: '',
  };

  // Generate each section
  if (includeSections.includes('project_overview')) {
    sections.project_overview = getProjectOverview(projectRoot);
  }

  if (includeSections.includes('architecture')) {
    sections.architecture = getArchitecture(projectRoot, agentDir);
  }

  if (includeSections.includes('conventions')) {
    sections.conventions = getConventions(projectRoot);
  }

  if (includeSections.includes('recent_changes')) {
    sections.recent_changes = getRecentChanges(projectRoot);
  }

  if (includeSections.includes('feature_progress')) {
    sections.feature_progress = getFeatureProgress(agentDir);
  }

  if (includeSections.includes('session_history')) {
    sections.session_history = getSessionHistory(agentDir);
  }

  if (includeSections.includes('tool_recommendations')) {
    const recs = getToolRecommendations(projectRoot, agentDir);
    const lines = ['## Tool Recommendations\n'];
    for (const rec of recs) {
      lines.push(`- **${rec.tool}** [${rec.priority}]: ${rec.reason}`);
    }
    sections.tool_recommendations = lines.join('\n');
  }

  // Build summary
  const allSections = Object.entries(sections)
    .filter(([_, content]) => content.length > 0)
    .map(([_, content]) => content);

  let summary = allSections.join('\n\n---\n\n');
  let tokenEstimate = estimateTokens(summary);

  // Truncate if needed
  if (tokenEstimate > maxTokens) {
    const ratio = maxTokens / tokenEstimate;
    const targetLength = Math.floor(summary.length * ratio * 0.9); // 10% buffer
    summary = summary.substring(0, targetLength) + '\n\n[Context truncated to fit token limit]';
    tokenEstimate = maxTokens;
  }

  return {
    sections,
    summary,
    token_estimate: tokenEstimate,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get compact context for continuation
 */
export function getCompactContext(projectRoot: string, agentDir: string): string {
  const context = primeContext(projectRoot, agentDir, {
    includeSections: ['feature_progress', 'session_history'],
    maxTokens: 2000,
  });

  return context.summary;
}

/**
 * Get tool recommendations only
 */
export function getToolRecommendationsOnly(
  projectRoot: string,
  agentDir: string
): ToolRecommendation[] {
  return getToolRecommendations(projectRoot, agentDir);
}

export default {
  primeContext,
  getCompactContext,
  getToolRecommendationsOnly,
};
