# Long-Running Agent Framework

A Claude Agent SDK framework implementing [Anthropic's best practices](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) for long-running agents with incremental progress tracking.

## Overview

This framework solves the core challenge of long-running agents: **working effectively across multiple context windows**. It implements a two-agent architecture:

1. **Initializer Agent** - Sets up the project environment on first run
2. **Coding Agent** - Makes incremental progress in every subsequent session

## Key Features

- **JSON-based Feature Tracking** - Comprehensive feature list with test steps (less prone to accidental modification than Markdown)
- **Progress Persistence** - Session logs that bridge context windows
- **Browser Automation Testing** - Puppeteer MCP integration for end-to-end verification
- **Poka-yoke Safeguards** - Error prevention that blocks deletion or modification of test criteria
- **Git Integration** - Automatic commits with descriptive messages
- **Project Detection** - Automatically detects framework, build tools, testing setup, and technology stack
- **Code Quality Automation** - Automated type checking, linting, and formatting validation
- **Dependency Management** - Monitors outdated packages and security vulnerabilities
- **Enhanced Git Utilities** - Conflict detection, branch management, and workflow guidance
- **Error Recovery** - Checkpoint system and rollback capabilities for quick recovery
- **Environment Validation** - Validates configuration files and environment variables
- **System Health Monitoring** - Comprehensive health checks for project structure and dependencies
- **Backend Infrastructure** - Autonomous Supabase setup and migration management

## Quick Start

```bash
# Install dependencies
npm install

# Run initialization (first time)
npm start

# Or force initialization mode
npm run agent:init

# Run coding agent (subsequent sessions)
npm run agent:code
```

## Project Structure

```
my-agent/
├── src/
│   ├── agents/
│   │   ├── initializer.ts      # First-run setup agent
│   │   ├── coding.ts           # Incremental progress agent
│   │   └── prompts/
│   │       ├── initializer.md  # Initializer system prompt
│   │       └── coding.md       # Coding agent system prompt
│   ├── config/
│   │   ├── agent-config.ts     # Shared configuration
│   │   └── mcp-config.ts       # Puppeteer MCP settings
│   ├── utils/
│   │   ├── feature-list.ts     # Feature list utilities
│   │   ├── progress.ts         # Progress file utilities
│   │   ├── project-detection.ts # Project type and stack detection
│   │   ├── code-quality.ts     # Code quality checks
│   │   ├── dependency-management.ts # Dependency auditing
│   │   ├── git-utils.ts        # Enhanced git operations
│   │   ├── error-recovery.ts   # Error logging and recovery
│   │   ├── environment-validation.ts # Environment validation
│   │   ├── health-check.ts     # System health monitoring
│   │   └── supabase-setup.ts   # Supabase backend setup
│   └── index.ts                # Main entry point
├── templates/
│   ├── feature_list.template.json
│   └── progress.template.txt
├── scripts/
│   ├── init.sh                 # Unix setup script
│   └── init.ps1                # Windows setup script
└── .agent/                     # Runtime directory (created automatically)
    ├── feature_list.json       # Feature tracking
    └── claude-progress.txt     # Session progress log
```

## How It Works

### First Run (Initializer Agent)

When you first run the framework, the Initializer Agent:

1. Analyzes your project specification
2. Generates a comprehensive `feature_list.json` with ALL features marked as `passes: false`
3. Creates `claude-progress.txt` with initial project context
4. Sets up `init.sh`/`init.ps1` scripts for environment bootstrapping
5. Makes an initial git commit

### Subsequent Runs (Coding Agent)

Every subsequent session, the Coding Agent:

1. Reads `claude-progress.txt` and git logs to understand current state
2. Runs the init script to start the development server
3. Verifies basic functionality still works via browser automation
4. Selects the highest-priority failing feature
5. Implements the feature incrementally
6. Tests using browser automation (as a human would)
7. Updates feature status and commits changes
8. Logs progress for the next session

## Feature List Format

```json
{
  "id": "feat-001",
  "category": "functional",
  "priority": 1,
  "description": "New chat button creates a fresh conversation",
  "steps": [
    "Navigate to main interface",
    "Click the 'New Chat' button",
    "Verify a new conversation is created",
    "Check that chat area shows welcome state",
    "Verify conversation appears in sidebar"
  ],
  "passes": false,
  "last_tested": null,
  "notes": ""
}
```

### Categories

- **functional** - Core application logic and features
- **ui** - User interface elements, styling, responsiveness
- **integration** - API calls, data flow, third-party services
- **performance** - Loading times, optimizations
- **accessibility** - Keyboard navigation, screen readers, ARIA

## Constraints (Poka-yoke)

The framework enforces these rules to prevent common agent failures:

1. **Cannot delete features** from the feature list
2. **Cannot modify test steps** (steps are immutable)
3. **Cannot modify descriptions** after creation
4. **Must verify via browser** before marking features as passing
5. **Must commit changes** before ending a session

## Configuration

Edit `src/config/agent-config.ts` to customize:

```typescript
export const agentConfig = {
  paths: {
    agentDir: '.agent',
    featureList: '.agent/feature_list.json',
    progressFile: '.agent/claude-progress.txt',
  },
  tools: {
    initializer: ['Read', 'Write', 'Bash', 'Glob'],
    coding: ['Read', 'Edit', 'Bash', 'Glob', 'Browser'],
  },
  permissionMode: 'acceptEdits',
  // ... more options
};
```

## Using on Other Projects

1. Copy this framework to your new project directory
2. Update `package.json` with your project details
3. Run `npm install`
4. Run `npm start` and provide your project specification
5. The initializer will create a feature list tailored to your project
6. Run `npm run agent:code` for each development session

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Auto-detect mode (init or coding) |
| `npm run agent:init` | Force initialization mode |
| `npm run agent:code` | Force coding mode |
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Type check without emitting |
| `npm run help` | Show usage information |

## Best Practices

Based on [Anthropic's documentation](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents):

1. **Incremental Progress** - Work on ONE feature at a time
2. **Clean State** - Always leave codebase in committable state
3. **Browser Verification** - Test as a human user would
4. **Progress Logging** - Document everything for the next session
5. **Git Discipline** - Descriptive commits for every change

## Failure Modes Addressed

| Problem | Solution |
|---------|----------|
| Agent declares victory too early | Feature list requires ALL features to pass |
| Leaves environment with bugs | Must verify via browser before marking done |
| Marks features done prematurely | Browser automation required for verification |
| Spends time figuring out setup | init.sh/init.ps1 scripts automate this |
| Loses context between sessions | claude-progress.txt + git logs |

## Best Practices Implementation

This framework implements comprehensive best practices for full-stack development:

- **Project Detection**: Automatically adapts to React, Next.js, Vue, and other frameworks
- **Code Quality**: Enforces TypeScript, ESLint, and Prettier standards
- **Security**: Monitors dependencies for vulnerabilities
- **Git Discipline**: Conflict detection and workflow guidance
- **Error Recovery**: Checkpoint system for rollback capability
- **Health Monitoring**: Comprehensive system health checks

See [BEST_PRACTICES.md](./BEST_PRACTICES.md) for detailed documentation.

## References

- [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)

## License

MIT
