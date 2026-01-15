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
import { createInterface } from 'readline';
import { homedir } from 'os';

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

// Auth configuration
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
// Authentication Functions
// ============================================================

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
  if (!existsSync(AUTH_CONFIG.configDir)) {
    mkdirSync(AUTH_CONFIG.configDir, { recursive: true });
  }
}

/**
 * Load stored credentials
 */
function loadCredentials() {
  try {
    if (existsSync(AUTH_CONFIG.credentialsPath)) {
      const data = readFileSync(AUTH_CONFIG.credentialsPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    // Ignore errors
  }
  return null;
}

/**
 * Save credentials to file
 */
function saveCredentials(credentials) {
  ensureConfigDir();
  writeFileSync(AUTH_CONFIG.credentialsPath, JSON.stringify(credentials, null, 2), {
    mode: 0o600,
  });
}

/**
 * Clear stored credentials
 */
function clearCredentials() {
  try {
    if (existsSync(AUTH_CONFIG.credentialsPath)) {
      unlinkSync(AUTH_CONFIG.credentialsPath);
    }
  } catch (error) {
    // Ignore errors
  }
}

/**
 * Check if authenticated
 */
function isAuthenticated() {
  // Check environment variables
  if (process.env[AUTH_CONFIG.envVars.API_KEY] || process.env[AUTH_CONFIG.envVars.SUBSCRIPTION_KEY]) {
    return true;
  }
  // Check stored credentials
  const credentials = loadCredentials();
  return credentials !== null && (credentials.apiKey || credentials.subscriptionKey);
}

/**
 * Get API key from credentials or environment
 */
function getApiKey() {
  if (process.env[AUTH_CONFIG.envVars.SUBSCRIPTION_KEY]) {
    return process.env[AUTH_CONFIG.envVars.SUBSCRIPTION_KEY];
  }
  if (process.env[AUTH_CONFIG.envVars.API_KEY]) {
    return process.env[AUTH_CONFIG.envVars.API_KEY];
  }
  const credentials = loadCredentials();
  if (credentials) {
    return credentials.subscriptionKey || credentials.apiKey || null;
  }
  return null;
}

/**
 * Validate API key with Anthropic
 */
async function validateApiKey(key) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    // 200 = valid, 401 = invalid, 400 = valid but bad request
    return response.status === 200 || response.status === 400;
  } catch (error) {
    // Network error - assume key might be valid
    log('Could not validate key online, proceeding anyway...', colors.yellow);
    return true;
  }
}

/**
 * Interactive login flow
 */
async function handleLogin() {
  showBanner();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  };

  try {
    log('\n========================================', colors.cyan);
    log('      Monty Agent Authentication', colors.bright);
    log('========================================\n', colors.cyan);

    log('Select authentication method:', colors.white);
    log('  1. Claude Code Subscription Key (Recommended)', colors.green);
    log('  2. Anthropic API Key', colors.white);
    log('');

    const choice = await question(`${colors.cyan}Enter choice (1 or 2): ${colors.reset}`);
    const method = choice === '2' ? 'api_key' : 'subscription';

    let keyPrompt, keyInstructions;
    if (method === 'subscription') {
      log('\nTo get your Claude Code subscription key:', colors.dim);
      log('  1. Go to https://claude.ai/settings/api', colors.dim);
      log('  2. Sign in with your Claude account', colors.dim);
      log('  3. Copy your subscription key', colors.dim);
      log('');
      keyPrompt = `${colors.cyan}Enter your Claude Code subscription key: ${colors.reset}`;
    } else {
      log('\nTo get your Anthropic API key:', colors.dim);
      log('  1. Go to https://console.anthropic.com/settings/keys', colors.dim);
      log('  2. Create or copy an existing API key', colors.dim);
      log('');
      keyPrompt = `${colors.cyan}Enter your Anthropic API key: ${colors.reset}`;
    }

    const key = await question(keyPrompt);

    if (!key || key.length < 20) {
      log('\nError: Invalid key format. Key appears too short.', colors.red);
      rl.close();
      return;
    }

    const email = await question(`${colors.cyan}Enter your email (optional, press Enter to skip): ${colors.reset}`);

    log('\nValidating credentials...', colors.yellow);
    const isValid = await validateApiKey(key);

    if (!isValid) {
      log('\nError: Could not validate credentials. Please check your key and try again.', colors.red);
      rl.close();
      return;
    }

    // Save credentials
    const credentials = {
      method,
      ...(method === 'subscription' ? { subscriptionKey: key } : { apiKey: key }),
      email: email || undefined,
      createdAt: new Date().toISOString(),
    };

    saveCredentials(credentials);

    log('\n' + '─'.repeat(50), colors.dim);
    log('Success! You are now logged in.', colors.green);
    log(`  Method: ${method === 'subscription' ? 'Claude Code Subscription' : 'API Key'}`, colors.white);
    if (email) {
      log(`  Email: ${email}`, colors.white);
    }
    log(`  Key: ${key.slice(0, 8)}...${key.slice(-4)}`, colors.dim);
    log('─'.repeat(50), colors.dim);
    log('\nCredentials saved to: ~/.monty/credentials.json', colors.dim);
    log('Run "monty init" or "monty code" to start.\n', colors.cyan);

    rl.close();
  } catch (error) {
    log(`\nLogin failed: ${error.message}`, colors.red);
    rl.close();
  }
}

/**
 * Handle logout
 */
function handleLogout() {
  showBanner();

  const wasAuthenticated = isAuthenticated();
  clearCredentials();

  if (wasAuthenticated) {
    log('\nYou have been logged out.', colors.green);
    log('Credentials removed from: ~/.monty/credentials.json\n', colors.dim);
  } else {
    log('\nYou were not logged in.\n', colors.yellow);
  }
}

/**
 * Handle whoami - show current user info
 */
function handleWhoami() {
  showBanner();

  log('\n========================================', colors.cyan);
  log('      Monty Agent - Current User', colors.bright);
  log('========================================\n', colors.cyan);

  const credentials = loadCredentials();
  const hasEnvKey = process.env[AUTH_CONFIG.envVars.API_KEY] || process.env[AUTH_CONFIG.envVars.SUBSCRIPTION_KEY];

  if (!isAuthenticated()) {
    log('Status: Not authenticated', colors.yellow);
    log('\nRun "monty login" to sign in.\n', colors.dim);
    return;
  }

  log('Status: Authenticated', colors.green);

  if (hasEnvKey) {
    const envVar = process.env[AUTH_CONFIG.envVars.SUBSCRIPTION_KEY]
      ? AUTH_CONFIG.envVars.SUBSCRIPTION_KEY
      : AUTH_CONFIG.envVars.API_KEY;
    log(`Source: Environment variable (${envVar})`, colors.white);
    const key = getApiKey();
    if (key) {
      log(`Key: ${key.slice(0, 8)}...${key.slice(-4)}`, colors.dim);
    }
  } else if (credentials) {
    log(`Method: ${credentials.method === 'subscription' ? 'Claude Code Subscription' : 'Anthropic API Key'}`, colors.white);
    if (credentials.email) {
      log(`Email: ${credentials.email}`, colors.white);
    }
    const key = credentials.subscriptionKey || credentials.apiKey;
    if (key) {
      log(`Key: ${key.slice(0, 8)}...${key.slice(-4)}`, colors.dim);
    }
    if (credentials.createdAt) {
      log(`Logged in: ${new Date(credentials.createdAt).toLocaleDateString()}`, colors.dim);
    }
    log('\nCredentials stored in: ~/.monty/credentials.json', colors.dim);
  }

  log('');
}

/**
 * Check auth before running agent commands
 */
function requireAuth() {
  if (!isAuthenticated()) {
    log('\n' + '─'.repeat(50), colors.dim);
    log('Authentication required', colors.yellow);
    log('─'.repeat(50), colors.dim);
    log('\nYou need to authenticate before running the agent.', colors.white);
    log('\nOptions:', colors.white);
    log('  1. Run "monty login" to sign in interactively', colors.cyan);
    log(`  2. Set ${AUTH_CONFIG.envVars.API_KEY} environment variable`, colors.cyan);
    log(`  3. Set ${AUTH_CONFIG.envVars.SUBSCRIPTION_KEY} environment variable\n`, colors.cyan);
    return false;
  }
  return true;
}

/**
 * Get environment with auth credentials for child process
 */
function getAuthEnv() {
  const env = { ...process.env };
  const apiKey = getApiKey();
  if (apiKey && !env[AUTH_CONFIG.envVars.API_KEY]) {
    env[AUTH_CONFIG.envVars.API_KEY] = apiKey;
  }
  return env;
}

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
  ${colors.cyan}monty login${colors.reset}                        Sign in with Claude/Anthropic subscription
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

async function main() {
  const args = process.argv.slice(2);

  // Handle help
  if (args.includes('--help') || args.includes('-h') || args.length === 0 && !existsSync(join(process.cwd(), '.agent'))) {
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

  // Handle login
  if (args.includes('login')) {
    await handleLogin();
    return;
  }

  // Handle logout
  if (args.includes('logout')) {
    handleLogout();
    return;
  }

  // Handle whoami
  if (args.includes('whoami')) {
    handleWhoami();
    return;
  }

  // Check authentication before running agent commands
  if (!requireAuth()) {
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
