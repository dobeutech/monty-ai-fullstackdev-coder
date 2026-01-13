#!/usr/bin/env node
/**
 * Long-Running Agent Framework
 * Main entry point that routes between initializer and coding agents.
 * 
 * Based on Anthropic's best practices for effective agent harnesses:
 * https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
 */

import { existsSync, mkdirSync } from "fs";
import { agentConfig } from "./config/agent-config.js";
import { runInitializerAgent } from "./agents/initializer.js";
import { runCodingAgent } from "./agents/coding.js";

/**
 * Check if this is the first run (no .agent directory)
 */
function isFirstRun(): boolean {
  return !existsSync(agentConfig.paths.agentDir);
}

/**
 * Run a function with retry logic for transient failures
 * Implements exponential backoff with configurable max retries
 */
async function runWithRetry(
  runFn: () => Promise<void>,
  maxRetries: number = agentConfig.session.maxRetries
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await runFn();
      return;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Don't retry on certain errors that indicate configuration issues
      if (errorMessage.includes("Feature list not found") || 
          errorMessage.includes("not been initialized")) {
        throw error;
      }
      
      if (attempt === maxRetries) {
        console.error(`\n❌ All ${maxRetries} attempts failed.`);
        throw error;
      }
      
      console.log(`\n⚠️  Attempt ${attempt}/${maxRetries} failed: ${errorMessage}`);
      console.log(`   Retrying in ${attempt} second(s)...`);
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): {
  forceInit: boolean;
  forceCoding: boolean;
  spec: string | undefined;
  context: string | undefined;
} {
  const args = process.argv.slice(2);
  
  return {
    forceInit: args.includes("--init") || process.env.FORCE_INIT === "true",
    forceCoding: args.includes("--code"),
    spec: args.find(a => a.startsWith("--spec="))?.split("=")[1],
    context: args.find(a => a.startsWith("--context="))?.split("=")[1],
  };
}

/**
 * Display usage information
 */
function showUsage(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    LONG-RUNNING AGENT FRAMEWORK                              ║
║                                                                              ║
║  Based on Anthropic's best practices for effective agent harnesses           ║
╚══════════════════════════════════════════════════════════════════════════════╝

USAGE:
  npm start                    Auto-detect mode (init or coding)
  npm run agent:init           Force initialization mode
  npm run agent:code           Force coding mode

OPTIONS:
  --init                       Force run initializer agent
  --code                       Force run coding agent
  --spec="..."                 Project specification for initializer
  --context="..."              Additional context for coding agent

ENVIRONMENT:
  FORCE_INIT=true              Force initialization mode

WORKFLOW:
  1. First run automatically triggers Initializer Agent
  2. Subsequent runs use Coding Agent for incremental progress
  3. Each session reads progress file and continues from where it left off

FILES:
  .agent/feature_list.json     Feature tracking (JSON)
  .agent/claude-progress.txt   Progress log between sessions
  scripts/init.sh              Unix environment setup
  scripts/init.ps1             Windows environment setup
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();
  
  // Show help if requested
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showUsage();
    process.exit(0);
  }
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    LONG-RUNNING AGENT FRAMEWORK                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

  // Determine which agent to run
  const shouldInitialize = args.forceInit || (isFirstRun() && !args.forceCoding);
  
  if (shouldInitialize) {
    // Initialize mode
    console.log("📦 Mode: INITIALIZER");
    console.log("━".repeat(70));
    
    if (!args.spec) {
      console.log(`
⚠️  No project specification provided.

Please provide a project spec using one of these methods:
  1. Command line: npm start -- --spec="Build a todo app with React..."
  2. Interactive: The agent will ask for your specification

For now, please describe what you want to build:
`);
      // In a real implementation, you'd read from stdin here
      // For now, we'll use a placeholder that prompts the agent to ask
      const spec = "Please ask the user for their project specification.";
      
      // Ensure .agent directory exists
      if (!existsSync(agentConfig.paths.agentDir)) {
        mkdirSync(agentConfig.paths.agentDir, { recursive: true });
      }
      
      await runWithRetry(() => runInitializerAgent(spec));
    } else {
      // Ensure .agent directory exists
      if (!existsSync(agentConfig.paths.agentDir)) {
        mkdirSync(agentConfig.paths.agentDir, { recursive: true });
      }
      
      await runWithRetry(() => runInitializerAgent(args.spec));
    }
  } else {
    // Coding mode
    console.log("🔨 Mode: CODING");
    console.log("━".repeat(70));
    
    if (!existsSync(agentConfig.paths.featureList)) {
      console.error(`
❌ Error: Feature list not found at ${agentConfig.paths.featureList}

The project has not been initialized. Run with --init flag first:
  npm run agent:init
`);
      process.exit(1);
    }
    
    await runWithRetry(() => runCodingAgent(args.context));
  }
}

// Run main function
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
