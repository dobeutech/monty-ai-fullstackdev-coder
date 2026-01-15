# Monty Full-Stack Agent

[![npm version](https://img.shields.io/npm/v/monty-fullstack-agent.svg)](https://www.npmjs.com/package/monty-fullstack-agent)
[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Node.js Version](https://img.shields.io/node/v/monty-fullstack-agent.svg)](https://nodejs.org)

An autonomous full-stack development agent powered by the Claude Agent SDK. Takes your project from **idea to production** with incremental progress tracking across multiple sessions.

Based on [Anthropic's best practices](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) for long-running agents.

## Installation

### Global Installation (Recommended)

```bash
# Install globally via npm
npm install -g monty-fullstack-agent

# Or via yarn
yarn global add monty-fullstack-agent

# Or via pnpm
pnpm add -g monty-fullstack-agent
```

### Run Directly with npx

```bash
# No installation needed - run directly
npx monty-fullstack-agent --help

# Initialize a new project
npx monty-fullstack-agent init --spec="Build a todo app with React and Supabase"

# Continue development
npx monty-fullstack-agent code
```

### Project-Level Installation

```bash
# Add to an existing project
npm install --save-dev monty-fullstack-agent

# Add scripts to package.json
# "scripts": {
#   "agent:init": "monty init",
#   "agent:code": "monty code"
# }
```

## Requirements

- **Node.js** >= 18.0.0
- **Anthropic API Key** - Set `ANTHROPIC_API_KEY` environment variable

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

## Quick Start

### Starting a New Project

```bash
# Create a new directory
mkdir my-awesome-app && cd my-awesome-app

# Initialize with your idea
monty init --spec="Build a modern todo app with React, TypeScript, Tailwind CSS, and Supabase backend. Include user authentication, real-time updates, and dark mode."

# Continue development
monty code
```

### Using with an Existing Codebase

```bash
# Navigate to your existing project
cd your-existing-project

# Initialize Monty (it will detect your tech stack)
monty init --spec="Complete the authentication system and add user dashboard"

# The agent will analyze your codebase and create a feature list
# Continue with incremental development
monty code
```

### Resuming Work

```bash
# Check project status
monty status

# Continue where you left off
monty code

# Add specific context for this session
monty code --context="Focus on fixing the login bug in auth.ts"
```

## Commands

| Command | Description |
|---------|-------------|
| `monty` | Auto-detect mode (shows help if not initialized) |
| `monty init` | Initialize a new project with feature list |
| `monty code` | Continue incremental development |
| `monty status` | Show project progress and feature status |
| `monty setup` | Set up Monty in current directory |
| `monty --help` | Show detailed help |

### Options

| Option | Description |
|--------|-------------|
| `--spec="..."` | Project specification for initialization |
| `--context="..."` | Additional context for coding session |
| `--help, -h` | Show help |
| `--version, -v` | Show version |

## How It Works

### Two-Agent Architecture

Monty uses a sophisticated two-agent system:

```
┌─────────────────┐     First Run     ┌─────────────────┐
│                 │ ───────────────── │   Initializer   │
│   Your Idea     │                   │      Agent      │
│                 │                   │                 │
└─────────────────┘                   └────────┬────────┘
                                               │
                                               │ Creates
                                               ▼
                                      ┌─────────────────┐
                                      │ .agent/         │
                                      │ - feature_list  │
                                      │ - progress.txt  │
                                      └────────┬────────┘
                                               │
┌─────────────────┐   Subsequent      ┌────────▼────────┐
│   Production    │ ◄──────────────── │    Coding       │
│   Ready App     │     Runs          │    Agent        │
│                 │                   │                 │
└─────────────────┘                   └─────────────────┘
```

### Initializer Agent (First Run)

When you first run `monty init`:

1. Analyzes your project specification
2. Detects existing tech stack (if any)
3. Generates comprehensive `feature_list.json` with ALL features marked as `passes: false`
4. Creates `claude-progress.txt` for session bridging
5. Makes initial git commit

### Coding Agent (Every Session)

When you run `monty code`:

1. Reads progress file and git logs to understand current state
2. Runs health checks and validates environment
3. Selects highest-priority failing feature
4. Implements feature incrementally
5. Tests using browser automation
6. Updates feature status and commits changes
7. Logs progress for the next session

## Feature Detection

Monty automatically detects and adapts to:

**Frameworks:** React, Next.js, Vue, Svelte, Angular, Vanilla JS
**Build Tools:** Vite, Webpack, Rollup, Turbopack
**Testing:** Vitest, Jest, Playwright, Cypress
**Backend:** Supabase, Express, Fastify, Next.js API
**Databases:** PostgreSQL, MySQL, MongoDB, SQLite
**Styling:** Tailwind CSS, CSS Modules, Styled Components, SASS
**Package Managers:** npm, yarn, pnpm, bun

## Files Created

```
your-project/
└── .agent/                        # Monty's working directory
    ├── feature_list.json          # Feature tracking (immutable structure)
    ├── claude-progress.txt        # Session logs for context bridging
    ├── error-log.json             # Error history for recovery
    └── checkpoints.json           # Recovery checkpoints
```

## Feature List Format

```json
{
  "project": {
    "name": "My App",
    "description": "A modern todo application",
    "created_at": "2025-01-15T00:00:00Z",
    "stack": ["react", "typescript", "tailwind", "supabase"]
  },
  "features": [
    {
      "id": "feat-001",
      "category": "functional",
      "priority": 1,
      "description": "User can create new todo items",
      "steps": [
        "Navigate to main interface",
        "Click 'Add Todo' button",
        "Enter todo text",
        "Verify todo appears in list"
      ],
      "passes": false,
      "last_tested": null,
      "notes": ""
    }
  ]
}
```

### Feature Categories

- **functional** - Core application logic and features
- **ui** - User interface elements, styling, responsiveness
- **integration** - API calls, data flow, third-party services
- **performance** - Loading times, optimizations
- **accessibility** - Keyboard navigation, screen readers, ARIA

## Poka-yoke Safeguards

The framework enforces these rules to prevent common agent failures:

1. **Cannot delete features** from the feature list
2. **Cannot modify test steps** (steps are immutable after creation)
3. **Cannot modify descriptions** after creation
4. **Must verify via browser** before marking features as passing
5. **Must commit changes** before ending a session

## Best Practices

Based on [Anthropic's documentation](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents):

| Best Practice | Implementation |
|--------------|----------------|
| Incremental Progress | Work on ONE feature at a time |
| Clean State | Always leave codebase in committable state |
| Browser Verification | Test as a human user would |
| Progress Logging | Document everything for the next session |
| Git Discipline | Descriptive commits for every change |

## Failure Modes Addressed

| Problem | Solution |
|---------|----------|
| Agent declares victory too early | Feature list requires ALL features to pass |
| Leaves environment with bugs | Must verify via browser before marking done |
| Marks features done prematurely | Browser automation required for verification |
| Spends time figuring out setup | Automated project detection and init scripts |
| Loses context between sessions | claude-progress.txt + git logs |

## Configuration

For advanced customization, modify `src/config/agent-config.ts`:

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
  session: {
    maxRetries: 3,
    autoCommit: true,
  },
};
```

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/dobeutech/monty-ai-fullstackdev-coder.git
cd monty-ai-fullstackdev-coder

# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev
```

### Project Structure

```
monty-fullstack-agent/
├── bin/
│   └── cli.js                 # CLI entry point
├── src/
│   ├── agents/
│   │   ├── initializer.ts     # First-run setup agent
│   │   ├── coding.ts          # Incremental progress agent
│   │   └── prompts/           # System prompts
│   ├── config/
│   │   ├── agent-config.ts    # Shared configuration
│   │   └── mcp-config.ts      # Browser automation settings
│   ├── utils/                 # Utility modules
│   └── index.ts               # Main entry point
├── templates/                 # File templates
└── scripts/                   # Init scripts
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Your Claude API key | Yes |
| `FORCE_INIT` | Force initialization mode | No |

## Troubleshooting

### "Feature list not found"

Run `monty init` first to initialize the project.

### "ANTHROPIC_API_KEY not set"

Set your API key:
```bash
export ANTHROPIC_API_KEY="your-key-here"
```

### "Permission denied"

Ensure the CLI is executable:
```bash
chmod +x $(which monty)
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## References

- [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)

## License

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)**.

**You are free to:**
- Share and redistribute the material
- Adapt, remix, and build upon the material

**Under these terms:**
- **Attribution** - You must give appropriate credit to Dobeu Tech Solutions LLC
- **NonCommercial** - You may not use the material for commercial purposes

For commercial licensing, please contact [Dobeu Tech Solutions LLC](https://github.com/dobeutech).

See [LICENSE](LICENSE) for full details.

---

Copyright (c) 2025 **Dobeu Tech Solutions LLC** - All Rights Reserved

Made with Claude Agent SDK
