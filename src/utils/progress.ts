/**
 * Progress File Utilities
 * Manages the claude-progress.txt file for session continuity.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { agentConfig } from "../config/agent-config.js";

/**
 * Session log entry structure
 */
export interface SessionLogEntry {
  timestamp: string;
  agentType: "initializer" | "coding";
  actions: string[];
  featuresCompleted: string[];
  issuesEncountered: string[];
  nextSteps: string[];
}

/**
 * Load the progress file content
 */
export function loadProgressFile(): string | null {
  const path = agentConfig.paths.progressFile;
  
  if (!existsSync(path)) {
    return null;
  }
  
  try {
    return readFileSync(path, "utf-8");
  } catch (error) {
    console.error("Error loading progress file:", error);
    return null;
  }
}

/**
 * Create a new progress file from template
 */
export function createProgressFile(projectName: string, projectDescription: string): boolean {
  const path = agentConfig.paths.progressFile;
  const now = new Date().toISOString();
  
  const content = `================================================================================
PROJECT: ${projectName}
CREATED: ${now}
LAST SESSION: ${now}
================================================================================

## PROJECT OVERVIEW
${projectDescription}

## CURRENT STATE
- Total Features: 0
- Completed: 0
- Remaining: 0
- Last Feature Worked On: None

## SESSION LOG
### ${now}
- Agent: initializer
- Actions taken:
  * Created project environment
  * Generated feature list
  * Set up progress tracking
- Features completed: []
- Issues encountered: []
- Next steps:
  * Begin implementing features
  * Start with highest priority items

## KNOWN ISSUES
- None yet

## NOTES FOR NEXT SESSION
- Project has been initialized
- All features are marked as failing initially
- Use browser automation for testing
================================================================================
`;

  try {
    writeFileSync(path, content, "utf-8");
    return true;
  } catch (error) {
    console.error("Error creating progress file:", error);
    return false;
  }
}

/**
 * Append a session log entry to the progress file
 */
export function appendSessionLog(entry: SessionLogEntry): boolean {
  const path = agentConfig.paths.progressFile;
  
  if (!existsSync(path)) {
    console.error("Progress file does not exist");
    return false;
  }
  
  const logContent = `
### ${entry.timestamp}
- Agent: ${entry.agentType}
- Actions taken:
${entry.actions.map(a => `  * ${a}`).join("\n")}
- Features completed: [${entry.featuresCompleted.join(", ")}]
- Issues encountered: [${entry.issuesEncountered.join(", ")}]
- Next steps:
${entry.nextSteps.map(s => `  * ${s}`).join("\n")}
`;

  try {
    // Read current content
    let content = readFileSync(path, "utf-8");
    
    // Update LAST SESSION timestamp
    content = content.replace(
      /LAST SESSION: .*/,
      `LAST SESSION: ${entry.timestamp}`
    );
    
    // Find the SESSION LOG section and append
    const sessionLogIndex = content.indexOf("## SESSION LOG");
    if (sessionLogIndex !== -1) {
      const nextSectionIndex = content.indexOf("\n## ", sessionLogIndex + 1);
      if (nextSectionIndex !== -1) {
        content = 
          content.slice(0, nextSectionIndex) + 
          logContent + 
          content.slice(nextSectionIndex);
      } else {
        // SESSION LOG is the last section, append before the closing line
        const closingIndex = content.lastIndexOf("================================================================================");
        if (closingIndex !== -1) {
          content = 
            content.slice(0, closingIndex) + 
            logContent + "\n" +
            content.slice(closingIndex);
        }
      }
    }
    
    writeFileSync(path, content, "utf-8");
    return true;
  } catch (error) {
    console.error("Error appending session log:", error);
    return false;
  }
}

/**
 * Update the current state section in the progress file
 */
export function updateCurrentState(
  totalFeatures: number,
  completed: number,
  lastFeature: string | null
): boolean {
  const path = agentConfig.paths.progressFile;
  
  if (!existsSync(path)) {
    return false;
  }
  
  try {
    let content = readFileSync(path, "utf-8");
    
    // Update the CURRENT STATE section
    const stateRegex = /## CURRENT STATE[\s\S]*?(?=\n## )/;
    const newState = `## CURRENT STATE
- Total Features: ${totalFeatures}
- Completed: ${completed}
- Remaining: ${totalFeatures - completed}
- Last Feature Worked On: ${lastFeature || "None"}

`;
    
    content = content.replace(stateRegex, newState);
    writeFileSync(path, content, "utf-8");
    return true;
  } catch (error) {
    console.error("Error updating current state:", error);
    return false;
  }
}

/**
 * Add a known issue to the progress file
 */
export function addKnownIssue(issue: string): boolean {
  const path = agentConfig.paths.progressFile;
  
  if (!existsSync(path)) {
    return false;
  }
  
  try {
    let content = readFileSync(path, "utf-8");
    
    // Find KNOWN ISSUES section
    const issuesIndex = content.indexOf("## KNOWN ISSUES");
    if (issuesIndex !== -1) {
      const nextSectionIndex = content.indexOf("\n## ", issuesIndex + 1);
      const insertPoint = nextSectionIndex !== -1 
        ? nextSectionIndex 
        : content.lastIndexOf("================================================================================");
      
      content = 
        content.slice(0, insertPoint) + 
        `- ${issue}\n` +
        content.slice(insertPoint);
    }
    
    writeFileSync(path, content, "utf-8");
    return true;
  } catch (error) {
    console.error("Error adding known issue:", error);
    return false;
  }
}

/**
 * Get a summary of the last session from the progress file
 */
export function getLastSessionSummary(): string | null {
  const content = loadProgressFile();
  
  if (!content) {
    return null;
  }
  
  // Extract the most recent session log entry
  const sessionLogMatch = content.match(/### (\d{4}-\d{2}-\d{2}T[\d:.]+Z)[\s\S]*?(?=\n### |\n## |$)/);
  
  if (sessionLogMatch) {
    return sessionLogMatch[0];
  }
  
  return null;
}

export default {
  loadProgressFile,
  createProgressFile,
  appendSessionLog,
  updateCurrentState,
  addKnownIssue,
  getLastSessionSummary,
};
