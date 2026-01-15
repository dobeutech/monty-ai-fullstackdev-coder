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

## Installation & Usage

### As Global CLI (npm package)

```bash
# Install globally
npm install -g monty-fullstack-agent

# Or run directly with npx
npx monty-fullstack-agent --help

# Initialize a project
monty init --spec="Build a todo app with React and Supabase"

# Continue development
monty code

# Check status
monty status
```

### Development Mode

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Type checking
npm run typecheck
```

## Commands

| Command | Description |
|---------|-------------|
| `monty init` | Initialize project with feature list |
| `monty code` | Continue incremental development |
| `monty status` | Show project progress |
| `monty --help` | Show usage information |

### CLI Options

- `--spec="..."` - Project specification for initializer
- `--context="..."` - Additional context for coding session
- `--init` - Force initialization mode
- `--code` - Force coding mode

## Architecture

### Two-Agent System

The framework routes between agents based on state:
- `src/index.ts` - Entry point that checks for `.agent/` directory to determine mode
- `src/agents/initializer.ts` - Creates feature list, progress file, and init scripts
- `src/agents/coding.ts` - Reads progress, selects features, implements, tests via browser
- `bin/cli.js` - CLI wrapper for global/npx usage

### System Prompts

Agent behavior is defined in markdown prompts loaded at runtime:
- `src/agents/prompts/initializer.md` - Instructions for project setup
- `src/agents/prompts/coding.md` - Session workflow, testing rules, constraints

### Configuration

- `src/config/agent-config.ts` - Paths, tools, permissions, git settings
- `src/config/mcp-config.ts` - Puppeteer browser automation settings

### Runtime Files (`.agent/`)

Created during initialization, consumed by coding agent:
- `feature_list.json` - JSON feature tracking (preferred over markdown for immutability)
- `claude-progress.txt` - Session log bridging context windows

### Utilities

- `src/utils/feature-list.ts` - Feature CRUD with Poka-yoke validation
- `src/utils/progress.ts` - Progress file management and session logging
- `src/utils/project-detection.ts` - Auto-detects frameworks and tech stack
- `src/utils/code-quality.ts` - TypeScript, ESLint, Prettier checks
- `src/utils/health-check.ts` - System health monitoring

## Feature List Schema

Features use this structure in `feature_list.json`:
```json
{
  "id": "feat-001",
  "category": "functional|ui|integration|performance|accessibility",
  "priority": 1,
  "description": "...",
  "steps": ["..."],
  "passes": false,
  "last_tested": null,
  "notes": ""
}
```

## Poka-yoke Constraints

The framework enforces these rules to prevent common agent failures:
- Cannot delete features from the feature list
- Cannot modify feature steps or descriptions (immutable after creation)
- Must verify via browser automation before marking features as passing
- All changes must be committed before session end

## Key Patterns

- Agents use Claude Agent SDK's `query()` function with streaming responses
- Tools are configured per agent type (initializer uses Write, coding uses Edit)
- Permission mode is `acceptEdits` by default
- Retry logic with exponential backoff handles transient failures

## Publishing

```bash
# Build and publish to npm
npm run build
npm publish

# Or use GitHub Actions workflow
# Push a release tag to trigger automatic publishing
```
