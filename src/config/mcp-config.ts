/**
 * MCP (Model Context Protocol) Configuration
 * Settings for Puppeteer browser automation integration.
 */

export interface PuppeteerConfig {
  server: string;
  capabilities: string[];
  defaultTimeout: number;
  headless: boolean;
  viewport: {
    width: number;
    height: number;
  };
  screenshotDir: string;
}

export interface MCPConfig {
  puppeteer: PuppeteerConfig;
}

export const mcpConfig: MCPConfig = {
  puppeteer: {
    server: '@anthropic/puppeteer-mcp',
    capabilities: [
      'navigate',
      'click',
      'type',
      'screenshot',
      'evaluate',
      'waitForSelector',
      'scroll',
      'hover',
    ],
    defaultTimeout: 30000,
    headless: true,
    viewport: {
      width: 1280,
      height: 720,
    },
    screenshotDir: '.agent/screenshots',
  },
};

/**
 * Get browser automation instructions for the agent prompt
 */
export function getBrowserInstructions(): string {
  return `
BROWSER AUTOMATION:
- Use the Browser tool to interact with the web application
- Navigate to pages using full URLs (e.g., http://localhost:3000)
- Wait for elements before interacting: waitForSelector
- Take screenshots to verify visual state
- Default timeout: ${mcpConfig.puppeteer.defaultTimeout}ms
- Viewport: ${mcpConfig.puppeteer.viewport.width}x${mcpConfig.puppeteer.viewport.height}

TESTING WORKFLOW:
1. Start dev server using init script
2. Navigate to the application URL
3. Perform test steps as defined in feature_list.json
4. Take screenshot for verification
5. Only mark feature as passing if ALL steps succeed
`.trim();
}

export default mcpConfig;
