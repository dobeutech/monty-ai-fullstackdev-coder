# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A Claude Agent SDK framework implementing Anthropic's best practices for long-running agents. The framework uses a two-agent architecture to enable incremental development across multiple context windows:

1. **Initializer Agent** - First-run setup that generates feature lists and project scaffolding
2. **Coding Agent** - Subsequent sessions that implement features incrementally with browser verification

## Commands

```bash
# Install dependencies
npm install

# Run (auto-detects mode based on .agent directory existence)
npm start

# Force initialization mode
npm run agent:init

# Force coding mode (incremental development)
npm run agent:code

# Provide project spec directly
npm start -- --spec="Build a todo app with React..."

# Add context to coding session
npm run agent:code -- --context="Focus on the login feature"

# Type checking
npm run typecheck

# Build TypeScript
npm run build
```

## Architecture

### Two-Agent System

The framework routes between agents based on state:
- `src/index.ts` - Entry point that checks for `.agent/` directory to determine mode
- `src/agents/initializer.ts` - Creates feature list, progress file, and init scripts
- `src/agents/coding.ts` - Reads progress, selects features, implements, tests via browser

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

- `src/utils/feature-list.ts` - Feature CRUD with Poka-yoke validation (prevents deletion/modification of test criteria)
- `src/utils/progress.ts` - Progress file management and session logging

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
