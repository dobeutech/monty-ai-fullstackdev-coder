/**
 * Coding Agent
 * Runs on every session after initialization to make incremental progress.
 * Based on Anthropic's best practices for long-running agents.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { agentConfig } from "../config/agent-config.js";
import { getBrowserInstructions } from "../config/mcp-config.js";
import { getSetupSummary } from "../utils/supabase-setup.js";
import { generateProjectSummary } from "../utils/project-detection.js";
import { generateQualitySummary } from "../utils/code-quality.js";
import { generateDependencySummary } from "../utils/dependency-management.js";
import { generateGitSummary } from "../utils/git-utils.js";
import { generateErrorRecoverySummary } from "../utils/error-recovery.js";
import { generateEnvironmentSummary } from "../utils/environment-validation.js";
import { generateHealthSummary } from "../utils/health-check.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load the coding agent system prompt from markdown file
 */
function loadCodingPrompt(): string {
  const promptPath = join(__dirname, "prompts", "coding.md");
  return readFileSync(promptPath, "utf-8");
}

/**
 * Get current progress summary from progress file
 */
function getProgressSummary(): string {
  const progressPath = agentConfig.paths.progressFile;
  
  if (!existsSync(progressPath)) {
    return "No progress file found. This may indicate an incomplete initialization.";
  }
  
  try {
    const content = readFileSync(progressPath, "utf-8");
    // Return first 50 lines as a summary
    const lines = content.split("\n").slice(0, 50);
    return lines.join("\n");
  } catch {
    return "Error reading progress file.";
  }
}

/**
 * Get feature list summary
 */
function getFeatureSummary(): string {
  const featurePath = agentConfig.paths.featureList;
  
  if (!existsSync(featurePath)) {
    return "No feature list found. Run initialization first.";
  }
  
  try {
    const content = readFileSync(featurePath, "utf-8");
    const data = JSON.parse(content);
    const total = data.features?.length ?? 0;
    const passing = data.features?.filter((f: { passes: boolean }) => f.passes).length ?? 0;
    
    return `Features: ${passing}/${total} passing`;
  } catch {
    return "Error reading feature list.";
  }
}

/**
 * Build the complete prompt for the coding agent
 */
export function buildCodingPrompt(additionalContext?: string): string {
  const systemPrompt = loadCodingPrompt();
  const browserInstructions = getBrowserInstructions();
  const progressSummary = getProgressSummary();
  const featureSummary = getFeatureSummary();
  
  // Get all status summaries
  const supabaseSummary = getSetupSummary();
  const projectSummary = generateProjectSummary();
  const qualitySummary = generateQualitySummary();
  const dependencySummary = generateDependencySummary();
  const gitSummary = generateGitSummary();
  const errorRecoverySummary = generateErrorRecoverySummary();
  const environmentSummary = generateEnvironmentSummary();
  const healthSummary = generateHealthSummary();

  let prompt = `${systemPrompt}

---

${browserInstructions}

---

## WORKING DIRECTORY

You are working in: ${agentConfig.paths.projectRoot}
All file paths should be relative to this directory.

CRITICAL SESSION RULES:
- Do NOT use KillShell or attempt to terminate background processes
- Do NOT use TaskOutput for shell management
- Let the harness handle cleanup automatically
- End your session naturally after providing a summary

---

## CURRENT PROJECT STATE

**Progress Summary:**
${progressSummary}

**Feature Status:** ${featureSummary}
${supabaseSummary}
${projectSummary}
${qualitySummary}
${dependencySummary}
${gitSummary}
${errorRecoverySummary}
${environmentSummary}
${healthSummary}

## PATHS

- Feature list: ${agentConfig.paths.featureList}
- Progress file: ${agentConfig.paths.progressFile}
- Init script (Windows): scripts/init.ps1
- Init script (Unix): scripts/init.sh
`;

  if (additionalContext) {
    prompt += `
---

## ADDITIONAL CONTEXT FROM USER

${additionalContext}
`;
  }

  prompt += `
---

Begin the development session now. Follow the startup sequence.`;

  return prompt;
}

/**
 * Run the coding agent
 */
export async function runCodingAgent(additionalContext?: string): Promise<void> {
  const prompt = buildCodingPrompt(additionalContext);
  
  console.log("🔨 Starting Coding Agent Session...");
  console.log("━".repeat(50));
  console.log(getFeatureSummary());
  console.log("━".repeat(50));
  
  for await (const message of query({
    prompt,
    options: {
      allowedTools: agentConfig.tools.coding,
      permissionMode: agentConfig.permissionMode,
    },
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if ("text" in block) {
          console.log(block.text);
        } else if ("name" in block) {
          console.log(`\n🔧 Tool: ${block.name}\n`);
        }
      }
    } else if (message.type === "result") {
      console.log("\n" + "━".repeat(50));
      if (message.subtype === "success") {
        console.log("✅ Session completed successfully");
      } else if (message.subtype === "error_during_execution") {
        console.log("⚠️  Session ended with errors - check logs above");
        console.log("    Note: This may be due to background process cleanup.");
        console.log("    If features were verified, the work was still saved.");
      } else {
        console.log(`ℹ️  Session ended: ${message.subtype}`);
      }
      console.log(getFeatureSummary());
    }
  }
}

export default runCodingAgent;
