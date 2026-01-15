# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Monty Full-Stack Agent** - A Claude Agent SDK framework implementing Anthropic's best practices for long-running agents. The framework uses a two-agent architecture to enable incremental development across multiple context windows.

### Key Capabilities
- Takes projects from **idea to production deployment**
- Works with **any codebase at any development stage**
- **Auto-detects** tech stack (React, Next.js, Vue, Supabase, etc.)
- **Incremental progress** tracking across sessions
- **Browser automation** for end-to-end testing

## Development Commands

### Essential Commands
```bash
# Install dependencies
npm install

# Development mode (runs without building)
npm run dev

# Build TypeScript to dist/
npm run build

# Type checking only (no output files)
npm run typecheck

# Clean build artifacts and .agent directory
npm run clean
```

### Running the Agent
```bash
# Force initialization mode
npm run agent:init

# Force coding mode
npm run agent:code

# Auto-detect mode (checks for .agent/ directory)
npm start
```

### Testing as Global CLI
```bash
# Build first
npm run build

# Link globally for testing
npm link

# Now you can use 'monty' command anywhere
monty --help
monty login
monty init --spec="Build a todo app"
```

## Authentication System

The framework supports **three authentication methods** with auto-detection:

### Authentication Priority (highest to lowest)
1. `ANTHROPIC_SUBSCRIPTION_KEY` environment variable
2. `ANTHROPIC_API_KEY` environment variable
3. Subscription key from `~/.monty/credentials.json`
4. API key from `~/.monty/credentials.json`

### Key Components
- `src/utils/auth-manager.ts` - Main authentication logic, credential storage
- `src/utils/claude-code-detector.ts` - Auto-detects Claude Code CLI credentials
- `src/utils/oauth-server.ts` - OAuth flow for Claude subscriptions
- `src/config/auth-config.ts` - Authentication configuration and types

### How Auto-Detection Works
1. On `monty login`, checks for existing Claude Code credentials in:
   - Windows: `%APPDATA%\claude\credentials.json`
   - macOS/Linux: `~/.config/claude/credentials.json`
2. If found, imports `accessToken`, `refreshToken`, and `expiresAt`
3. Stores in `~/.monty/credentials.json` with restricted permissions (0600)
4. Sets `ANTHROPIC_API_KEY` environment variable for Claude Agent SDK

### Authentication Commands
```bash
# Interactive login (tries auto-detect first, then prompts)
monty login

# Check authentication status
monty whoami

# Logout (clears ~/.monty/credentials.json)
monty logout
```

## Architecture Deep Dive

### Two-Agent Routing System

The entry point (`src/index.ts`) determines which agent to run:

```typescript
// Decision logic:
const shouldInitialize = args.forceInit || (isFirstRun() && !args.forceCoding);

if (shouldInitialize) {
  runInitializerAgent(spec);
} else {
  runCodingAgent(context);
}
```

**Initializer Agent** (`src/agents/initializer.ts`):
- Runs **once** when no `.agent/` directory exists
- Allowed tools: `['Read', 'Write', 'Bash', 'Glob', 'Grep']`
- Creates feature list, progress file, init scripts
- Makes initial git commit

**Coding Agent** (`src/agents/coding.ts`):
- Runs **every subsequent session**
- Allowed tools: `['Read', 'Edit', 'Bash', 'Glob', 'Grep', 'Browser', 'Task']`
- Follows 7-step startup sequence (see `prompts/coding.md`)
- Implements ONE feature per session
- Tests via browser automation
- Commits changes with `[monty]` prefix

### System Prompts

Agent behavior is defined in markdown files loaded at runtime:

- `src/agents/prompts/initializer.md` - Instructs agent to create 50-200+ features, all marked `passes: false`
- `src/agents/prompts/coding.md` - Defines 7-step startup sequence, Poka-yoke rules, browser testing workflow

These prompts are loaded via `readFileSync()` and concatenated with runtime state (progress summary, feature status, health checks).

### Configuration Files

**`src/config/agent-config.ts`** - Central configuration:
```typescript
export const agentConfig: AgentConfig = {
  paths: { agentDir: '.agent', featureList, progressFile, ... },
  tools: { initializer: [...], coding: [...] },
  permissionMode: 'acceptEdits',
  git: { autoCommit: true, commitMessagePrefix: '[monty]', ... },
  session: { maxRetries: 3, verifyBasicFunctionality: true, ... },
  features: { enableTDD: true, enableAuditLog: true, ... },
  model: { default: 'claude-3-5-sonnet', ... }
}
```

**`src/config/mcp-config.ts`** - Browser automation settings for Puppeteer MCP server

**`src/config/auth-config.ts`** - Authentication types, paths, environment variable names

### Runtime Files (`.agent/`)

Created during initialization, consumed by coding agent:

**`feature_list.json`** - Canonical source of truth for features:
```json
{
  "project": { "name": "...", "description": "...", "stack": [...] },
  "features": [
    {
      "id": "feat-001",
      "category": "functional|ui|integration|performance|accessibility",
      "priority": 1,
      "description": "...",
      "steps": ["Step 1", "Step 2", ...],
      "passes": false,
      "last_tested": null,
      "notes": ""
    }
  ]
}
```

**`claude-progress.txt`** - Session log for bridging context windows. First 50 lines are included in coding agent prompt.

**`session_state.json`** - Tracks current session state, last feature worked on

**`checkpoints/`** - Recovery checkpoints (auto-saved every 3 features by default)

**`usage_log.jsonl`** - Tracks API usage per session

**`audit_log.jsonl`** - Records all file modifications for security

## Utilities Reference

### Feature Management
**`src/utils/feature-list.ts`** - Feature CRUD with Poka-yoke validation:
- `readFeatureList()` - Load and parse JSON
- `writeFeatureList()` - Save with validation
- `addFeature()` - Append new feature
- `updateFeature()` - Update status/notes only (description/steps immutable)
- `deleteFeature()` - **BLOCKED** by Poka-yoke rules
- `getNextFeature()` - Select highest-priority failing feature
- `validateFeature()` - Ensure required fields present

### Progress Tracking
**`src/utils/progress.ts`** - Progress file management:
- `appendProgress(message)` - Add timestamped entry
- `readProgress()` - Get recent entries
- `createProgressFile()` - Initialize with project overview

### Project Detection
**`src/utils/project-detection.ts`** - Auto-detects tech stack:
- Scans `package.json` dependencies
- Identifies framework (React, Next.js, Vue, Svelte, Angular)
- Detects build tools (Vite, Webpack, Rollup)
- Finds testing setup (Vitest, Jest, Playwright)
- Discovers backend (Supabase, Express, Fastify)
- Returns structured `ProjectInfo` object

### Code Quality Checks
**`src/utils/code-quality.ts`** - Runs linting/type checks:
- `runTypeCheck()` - Executes `tsc --noEmit`
- `runLinter()` - Runs ESLint if configured
- `runFormatter()` - Checks Prettier formatting
- `generateQualitySummary()` - Aggregates results for prompt

### Dependency Management
**`src/utils/dependency-management.ts`** - Manages npm packages:
- `checkOutdatedPackages()` - Finds packages with updates
- `checkSecurityVulnerabilities()` - Runs `npm audit`
- `installMissingPackages()` - Auto-install if package.json changed

### Git Operations
**`src/utils/git-utils.ts`** - Git helpers:
- `getCurrentBranch()` - Get active branch name
- `hasUncommittedChanges()` - Check working directory status
- `commitChanges(message)` - Create commit with `[monty]` prefix
- `generateGitSummary()` - Recent commits, branch, status

### Error Recovery
**`src/utils/error-recovery.ts`** - Checkpoint system:
- `createCheckpoint(featureId)` - Save codebase state
- `restoreCheckpoint(checkpointId)` - Rollback to previous state
- `listCheckpoints()` - Show available recovery points

### Health Monitoring
**`src/utils/health-check.ts`** - System health validation:
- Checks if dev server is running
- Validates environment variables
- Ensures dependencies are installed
- Confirms browser automation is available
- Returns pass/fail status with warnings

## Poka-yoke Constraints

The framework enforces these rules to prevent common agent failures:

1. **Cannot delete features** - `deleteFeature()` throws error
2. **Cannot modify test steps** - `steps` field is immutable after creation
3. **Cannot modify descriptions** - `description` field is immutable
4. **Must verify via browser** - Features cannot be marked `passes: true` without browser test
5. **Must commit changes** - Session cannot end with uncommitted changes
6. **Cannot force push** - Git operations block `--force` flag
7. **Cannot push to main** - Direct pushes to main/master are blocked

## Feature Categories

- **functional** - Core application logic, data operations
- **ui** - User interface elements, styling, responsiveness
- **integration** - API calls, data flow, third-party services
- **performance** - Loading times, bundle size, optimizations
- **accessibility** - Keyboard navigation, screen readers, ARIA labels

## Session Workflow

Each coding session follows this pattern:

1. **Review system status** - Health checks, git status, dependencies
2. **Orient** - Run `pwd`, understand working directory
3. **Read progress history** - Load `claude-progress.txt`
4. **Review git history** - `git log --oneline -20`
5. **Read feature list** - Load `feature_list.json`, find next feature
6. **Address system issues** - Fix linting errors, install deps, resolve conflicts
7. **Start dev environment** - Run `scripts/init.sh` or `scripts/init.ps1`
8. **Implement feature** - Code changes to satisfy test steps
9. **Test via browser** - Use Browser tool to verify functionality
10. **Update feature status** - Mark `passes: true` if verified
11. **Commit changes** - `git add .` + `git commit -m "[monty] feat-XXX: ..."`
12. **Log progress** - Append summary to `claude-progress.txt`
13. **End session** - Provide summary to user

## Publishing to npm

```bash
# 1. Update version in package.json
npm version patch  # or minor, major

# 2. Build TypeScript
npm run build

# 3. Test locally
npm link
monty --version

# 4. Publish to npm (requires npm login)
npm publish

# 5. Unlink if testing
npm unlink -g @dobeutechsolutions/monty-fullstack-agent
```

The package is published as `@dobeutechsolutions/monty-fullstack-agent` under CC BY-NC 4.0 license.

## Key Implementation Patterns

### Agent SDK Usage
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: buildCodingPrompt(),
  options: {
    allowedTools: agentConfig.tools.coding,
    permissionMode: agentConfig.permissionMode,
  },
})) {
  // Handle streaming responses
}
```

### Retry Logic
```typescript
async function runWithRetry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fn();
      return;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}
```

### Environment Variable Injection
The framework sets `ANTHROPIC_API_KEY` for child processes before spawning agents:
```typescript
authManager.setEnvForChildProcess();
// Now Claude Agent SDK can access credentials
```
