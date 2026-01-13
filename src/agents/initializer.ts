/**
 * Initializer Agent
 * Runs on first execution to set up the project environment.
 * Based on Anthropic's best practices for long-running agents.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { agentConfig } from "../config/agent-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load the initializer system prompt from markdown file
 */
function loadInitializerPrompt(): string {
  const promptPath = join(__dirname, "prompts", "initializer.md");
  return readFileSync(promptPath, "utf-8");
}

/**
 * Build the complete prompt for the initializer agent
 */
export function buildInitializerPrompt(userSpec: string): string {
  const systemPrompt = loadInitializerPrompt();
  
  return `${systemPrompt}

---

## USER'S PROJECT SPECIFICATION

${userSpec}

---

## PATHS TO USE

- Agent directory: ${agentConfig.paths.agentDir}
- Feature list: ${agentConfig.paths.featureList}
- Progress file: ${agentConfig.paths.progressFile}

## INITIALIZATION CHECKLIST

1. [ ] Create .agent directory
2. [ ] Create feature_list.json with ALL features
3. [ ] Create claude-progress.txt with initial state
4. [ ] Create scripts/init.sh (Unix)
5. [ ] Create scripts/init.ps1 (Windows)
6. [ ] Make initial git commit

Begin the initialization process now.`;
}

/**
 * Run the initializer agent
 */
export async function runInitializerAgent(userSpec: string): Promise<void> {
  const prompt = buildInitializerPrompt(userSpec);
  
  console.log("🚀 Starting Initializer Agent...");
  console.log("━".repeat(50));
  
  for await (const message of query({
    prompt,
    options: {
      allowedTools: agentConfig.tools.initializer,
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
      console.log("\n━".repeat(50));
      console.log(`✅ Initialization ${message.subtype}`);
    }
  }
}

export default runInitializerAgent;
