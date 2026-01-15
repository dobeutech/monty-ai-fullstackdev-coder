#!/usr/bin/env node

/**
 * Monty Full-Stack Agent CLI
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0 - Non-commercial use only
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * A Claude Agent SDK framework for autonomous full-stack development.
 * Takes projects from idea to production deployment.
 *
 * Usage:
 *   monty                        - Auto-detect mode (init or continue coding)
 *   monty init                   - Initialize a new project
 *   monty code                   - Continue coding session
 *   monty --spec="..."          - Start with a project specification
 *   monty --help                - Show help
 *
 * Install globally:
 *   npm install -g monty-fullstack-agent
 *
 * Or run directly:
 *   npx monty-fullstack-agent
 */

import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';
import { homedir } from 'os';

// Import auth manager from the compiled JS if available, or try importing the TS version
// This handles both development (ts-node) and production (node) environments
let authManager;
try {
  // Try importing from the same directory structure (relative to cli.js)
  // For production build: ../utils/auth-manager.js
  const authManagerPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'utils', 'auth-manager.ts');
  
  // We need to use the actual file location based on where we are running
  // If running via tsx/ts-node, we can import .ts files
  // If running via node (production), we need the .js files in dist/
  
  // For now, in this CLI wrapper, we'll replicate the core logic needed for bootstrapping
  // but delegate actual authentication handling to the main application logic where possible
  // OR we can dynamically import the auth manager.
} catch (e) {
  // Fallback
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// Auth configuration (Duplicate minimal config needed for CLI bootstrap)
const AUTH_CONFIG = {
  configDir: join(homedir(), '.monty'),
  get credentialsPath() { return join(this.configDir, 'credentials.json'); },
  envVars: {
    API_KEY: 'ANTHROPIC_API_KEY',
    SUBSCRIPTION_KEY: 'ANTHROPIC_SUBSCRIPTION_KEY',
  },
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// ============================================================
// CLI Functions
// ============================================================

function showBanner() {
  console.log(`
${colors.cyan}${colors.bright}
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   ███╗   ███╗ ██████╗ ███╗   ██╗████████╗██╗   ██╗                          ║
║   ████╗ ████║██╔═══██╗████╗  ██║╚══██╔══╝╚██╗ ██╔╝                          ║
║   ██╔████╔██║██║   ██║██╔██╗ ██║   ██║    ╚████╔╝                           ║
║   ██║╚██╔╝██║██║   ██║██║╚██╗██║   ██║     ╚██╔╝                            ║
║   ██║ ╚═╝ ██║╚██████╔╝██║ ╚████║   ██║      ██║                             ║
║   ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝      ╚═╝                             ║
║                                                                              ║
║            ${colors.white}FULL-STACK AUTONOMOUS DEVELOPMENT AGENT${colors.cyan}                       ║
║            ${colors.dim}Powered by Claude Agent SDK${colors.cyan}${colors.bright}                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
}

function showHelp() {
  showBanner();
  console.log(`
${colors.bright}USAGE:${colors.reset}
  ${colors.cyan}monty${colors.reset}                              Auto-detect mode
  ${colors.cyan}monty init${colors.reset}                         Initialize new project
  ${colors.cyan}monty code${colors.reset}                         Continue coding session
  ${colors.cyan}monty setup${colors.reset}                        Set up monty in current directory
  ${colors.cyan}monty status${colors.reset}                       Show project progress

${colors.bright}AUTHENTICATION:${colors.reset}
  ${colors.cyan}monty login${colors.reset}                        Sign in (Auto-detect / OAuth / API Key)
  ${colors.cyan}monty logout${colors.reset}                       Sign out and clear credentials
  ${colors.cyan}monty whoami${colors.reset}                       Show current authentication status

${colors.bright}OPTIONS:${colors.reset}
  ${colors.yellow}--spec="..."${colors.reset}                     Project specification
  ${colors.yellow}--context="..."${colors.reset}                  Additional context for coding
  ${colors.yellow}--help, -h${colors.reset}                       Show this help message
  ${colors.yellow}--version, -v${colors.reset}                    Show version

${colors.bright}QUICK START:${colors.reset}
  ${colors.dim}# Create a new project${colors.reset}
  ${colors.green}mkdir my-app && cd my-app${colors.reset}
  ${colors.green}monty init --spec="Build a todo app with React and Supabase"${colors.reset}

  ${colors.dim}# Continue development${colors.reset}
  ${colors.green}monty code${colors.reset}

  ${colors.dim}# Or use npx directly${colors.reset}
  ${colors.green}npx monty-fullstack-agent init --spec="Your project idea..."${colors.reset}

${colors.bright}WORKFLOW:${colors.reset}
  1. ${colors.cyan}monty init${colors.reset} - Analyzes your spec and creates feature list
  2. ${colors.cyan}monty code${colors.reset} - Implements features incrementally with testing
  3. Repeat ${colors.cyan}monty code${colors.reset} until all features pass

${colors.bright}FILES CREATED:${colors.reset}
  ${colors.dim}.agent/feature_list.json${colors.reset}     Feature tracking
  ${colors.dim}.agent/claude-progress.txt${colors.reset}   Progress between sessions

${colors.bright}ENVIRONMENT:${colors.reset}
  ${colors.yellow}ANTHROPIC_API_KEY${colors.reset}          Anthropic API key (or use "monty login")
  ${colors.yellow}ANTHROPIC_SUBSCRIPTION_KEY${colors.reset} Claude Code subscription key

${colors.bright}DOCUMENTATION:${colors.reset}
  https://github.com/dobeutech/monty-ai-fullstackdev-coder
`);
}

function showVersion() {
  const packagePath = join(__dirname, '..', 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
    console.log(`monty-fullstack-agent v${pkg.version}`);
  } catch {
    console.log('monty-fullstack-agent v1.0.0');
  }
}

function showStatus() {
  const cwd = process.cwd();
  const agentDir = join(cwd, '.agent');
  const featureListPath = join(agentDir, 'feature_list.json');
  const progressPath = join(agentDir, 'claude-progress.txt');

  showBanner();

  if (!existsSync(agentDir)) {
    log('\n⚠️  No .agent directory found. Project not initialized.', colors.yellow);
    log('   Run: monty init --spec="Your project idea..."', colors.dim);
    return;
  }

  if (!existsSync(featureListPath)) {
    log('\n⚠️  Feature list not found. Run: monty init', colors.yellow);
    return;
  }

  try {
    const features = JSON.parse(readFileSync(featureListPath, 'utf-8'));
    const total = features.features?.length || 0;
    const passing = features.features?.filter(f => f.passes).length || 0;
    const percentage = total > 0 ? Math.round((passing / total) * 100) : 0;

    log('\n📊 PROJECT STATUS', colors.bright);
    log('─'.repeat(50), colors.dim);
    log(`   Project: ${features.project?.name || 'Unknown'}`, colors.white);
    log(`   Total Features: ${total}`, colors.white);
    log(`   Passing: ${passing}`, colors.green);
    log(`   Remaining: ${total - passing}`, colors.yellow);
    log(`   Progress: ${percentage}%`, percentage === 100 ? colors.green : colors.cyan);

    // Progress bar
    const barWidth = 30;
    const filled = Math.round((percentage / 100) * barWidth);
    const empty = barWidth - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    log(`\n   [${bar}] ${percentage}%`, percentage === 100 ? colors.green : colors.cyan);

    // Show categories
    if (features.features?.length > 0) {
      const categories = {};
      features.features.forEach(f => {
        if (!categories[f.category]) {
          categories[f.category] = { total: 0, passing: 0 };
        }
        categories[f.category].total++;
        if (f.passes) categories[f.category].passing++;
      });

      log('\n   By Category:', colors.bright);
      Object.entries(categories).forEach(([cat, data]) => {
        const catPct = Math.round((data.passing / data.total) * 100);
        const color = catPct === 100 ? colors.green : catPct > 50 ? colors.yellow : colors.red;
        log(`     ${cat}: ${data.passing}/${data.total} (${catPct}%)`, color);
      });
    }

    log('\n' + '─'.repeat(50), colors.dim);
    log('   Run "monty code" to continue development', colors.dim);
  } catch (err) {
    log(`\n❌ Error reading feature list: ${err.message}`, colors.red);
  }
}

async function setupInDirectory() {
  const cwd = process.cwd();
  showBanner();

  log('\n📁 Setting up Monty in current directory...', colors.cyan);
  log(`   Directory: ${cwd}`, colors.dim);

  // Check if already initialized
  if (existsSync(join(cwd, '.agent'))) {
    log('\n✅ Project already initialized!', colors.green);
    log('   Run "monty code" to continue development.', colors.dim);
    return;
  }

  // Check for package.json
  if (!existsSync(join(cwd, 'package.json'))) {
    log('\n⚠️  No package.json found.', colors.yellow);
    log('   This appears to be a new project.', colors.dim);
    log('   Run: monty init --spec="Your project idea..."', colors.dim);
    return;
  }

  log('\n✅ Ready to initialize!', colors.green);
  log('   Run: monty init --spec="Your project specification..."', colors.dim);
}

// To avoid duplicating logic in CLI and potentially having sync issues,
// we will delegate auth commands to a script that uses the full AuthManager
async function runAuthCommand(command) {
  const distPath = join(__dirname, '..', 'dist', 'index.js');
  const srcPath = join(__dirname, '..', 'src', 'index.ts');
  
  let entryPoint;
  let runner;
  let runnerArgs;

  if (existsSync(distPath)) {
    entryPoint = distPath;
    runner = 'node';
    runnerArgs = [entryPoint];
  } else if (existsSync(srcPath)) {
    entryPoint = srcPath;
    runner = 'npx';
    runnerArgs = ['tsx', entryPoint];
  } else {
    log('❌ Error: Could not find entry point.', colors.red);
    process.exit(1);
  }

  // We use the main entry point with specific flags to trigger auth manager logic
  // This ensures we use the robust AuthManager implementation we just wrote
  const child = spawn(runner, [...runnerArgs, `--${command}`], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });

  return new Promise((resolve) => {
    child.on('close', (code) => {
      resolve(code);
    });
  });
}

// Check auth status by reading file directly (fast check for CLI)
function checkAuthStatus() {
  if (process.env[AUTH_CONFIG.envVars.API_KEY] || process.env[AUTH_CONFIG.envVars.SUBSCRIPTION_KEY]) {
    return true;
  }
  
  try {
    if (existsSync(AUTH_CONFIG.credentialsPath)) {
      const data = readFileSync(AUTH_CONFIG.credentialsPath, 'utf-8');
      const creds = JSON.parse(data);
      return !!(creds.apiKey || creds.subscriptionKey);
    }
  } catch (e) {
    // Ignore
  }
  return false;
}

// Get API key for environment injection
function getApiKey() {
  if (process.env[AUTH_CONFIG.envVars.SUBSCRIPTION_KEY]) return process.env[AUTH_CONFIG.envVars.SUBSCRIPTION_KEY];
  if (process.env[AUTH_CONFIG.envVars.API_KEY]) return process.env[AUTH_CONFIG.envVars.API_KEY];
  
  try {
    if (existsSync(AUTH_CONFIG.credentialsPath)) {
      const data = readFileSync(AUTH_CONFIG.credentialsPath, 'utf-8');
      const creds = JSON.parse(data);
      return creds.subscriptionKey || creds.apiKey;
    }
  } catch (e) {}
  return null;
}

function getAuthEnv() {
  const env = { ...process.env };
  const apiKey = getApiKey();
  if (apiKey && !env[AUTH_CONFIG.envVars.API_KEY]) {
    env[AUTH_CONFIG.envVars.API_KEY] = apiKey;
  }
  return env;
}

async function main() {
  const args = process.argv.slice(2);

  // Handle help
  if (args.includes('--help') || args.includes('-h') || (args.length === 0 && !existsSync(join(process.cwd(), '.agent')))) {
    showHelp();
    return;
  }

  // Handle version
  if (args.includes('--version') || args.includes('-v')) {
    showVersion();
    return;
  }

  // Handle status
  if (args.includes('status')) {
    showStatus();
    return;
  }

  // Handle setup
  if (args.includes('setup')) {
    await setupInDirectory();
    return;
  }

  // Handle auth commands by delegating to the main app
  // This ensures we use the full AuthManager logic
  if (args.includes('login')) {
    await runAuthCommand('login');
    return;
  }

  if (args.includes('logout')) {
    await runAuthCommand('logout');
    return;
  }

  if (args.includes('whoami')) {
    await runAuthCommand('whoami');
    return;
  }

  // Check authentication before running agent commands
  if (!checkAuthStatus()) {
    log('\n' + '─'.repeat(50), colors.dim);
    log('Authentication required', colors.yellow);
    log('─'.repeat(50), colors.dim);
    log('\nYou need to authenticate before running the agent.', colors.white);
    log('\nOptions:', colors.white);
    log('  1. Run "monty login" to sign in interactively', colors.cyan);
    log(`  2. Set ${AUTH_CONFIG.envVars.API_KEY} environment variable`, colors.cyan);
    log(`  3. Set ${AUTH_CONFIG.envVars.SUBSCRIPTION_KEY} environment variable\n`, colors.cyan);
    process.exit(1);
  }

  // Determine the main entry point
  const distPath = join(__dirname, '..', 'dist', 'index.js');
  const srcPath = join(__dirname, '..', 'src', 'index.ts');

  let entryPoint;
  let runner;
  let runnerArgs;

  if (existsSync(distPath)) {
    entryPoint = distPath;
    runner = 'node';
    runnerArgs = [entryPoint, ...args];
  } else if (existsSync(srcPath)) {
    // Development mode - use tsx
    entryPoint = srcPath;
    runner = 'npx';
    runnerArgs = ['tsx', entryPoint, ...args];
  } else {
    log('❌ Error: Could not find entry point.', colors.red);
    log('   Please run "npm run build" first.', colors.dim);
    process.exit(1);
  }

  // Map subcommands to flags
  const commandMap = {
    'init': '--init',
    'code': '--code',
  };

  // Transform args if needed
  const transformedArgs = args.map(arg => commandMap[arg] || arg);

  showBanner();

  // Run the main agent with authenticated environment
  const child = spawn(runner, [...runnerArgs.slice(0, 1), ...transformedArgs.filter(a => !['init', 'code', 'status', 'setup', 'login', 'logout', 'whoami'].includes(a))], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: getAuthEnv(),
  });

  child.on('error', (err) => {
    log(`❌ Error: ${err.message}`, colors.red);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
