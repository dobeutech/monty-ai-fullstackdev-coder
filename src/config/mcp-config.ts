/**
 * MCP (Model Context Protocol) Configuration (Feature A4)
 * Settings for browser automation, GitHub, database, and other integrations
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

/**
 * MCP Server types
 */
export type MCPTransportType = 'stdio' | 'sse' | 'sdk';

/**
 * Base MCP server configuration
 */
export interface MCPServerBase {
  name: string;
  description: string;
  enabled: boolean;
  type: MCPTransportType;
}

/**
 * Stdio MCP server (external process)
 */
export interface StdioMCPServer extends MCPServerBase {
  type: 'stdio';
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * SSE MCP server (remote HTTP)
 */
export interface SSEMCPServer extends MCPServerBase {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

/**
 * All MCP server types
 */
export type MCPServer = StdioMCPServer | SSEMCPServer;

/**
 * Browser automation config
 */
export interface BrowserConfig {
  defaultTimeout: number;
  headless: boolean;
  viewport: {
    width: number;
    height: number;
  };
  screenshotDir: string;
}

/**
 * Full MCP configuration
 */
export interface MCPConfig {
  browser: BrowserConfig;
  servers: Record<string, MCPServer>;
}

/**
 * Playwright MCP Server - Browser automation
 */
export const playwrightServer: StdioMCPServer = {
  name: 'playwright',
  description: 'Browser automation for E2E testing with Playwright',
  enabled: true,
  type: 'stdio',
  command: 'npx',
  args: ['@anthropic-ai/mcp-server-playwright'],
};

/**
 * GitHub MCP Server - Repository management
 */
export const githubServer: StdioMCPServer = {
  name: 'github',
  description: 'GitHub integration for PRs, issues, and CI/CD',
  enabled: false, // Requires GITHUB_TOKEN
  type: 'stdio',
  command: 'npx',
  args: ['@anthropic-ai/mcp-server-github'],
  env: {
    GITHUB_TOKEN: '${GITHUB_TOKEN}',
  },
};

/**
 * Filesystem MCP Server - Advanced file operations
 */
export const filesystemServer: StdioMCPServer = {
  name: 'filesystem',
  description: 'Advanced filesystem operations beyond basic Read/Write',
  enabled: false,
  type: 'stdio',
  command: 'npx',
  args: ['@anthropic-ai/mcp-server-filesystem'],
};

/**
 * PostgreSQL MCP Server - Database operations
 */
export const postgresServer: StdioMCPServer = {
  name: 'postgres',
  description: 'PostgreSQL database operations and queries',
  enabled: false, // Requires DATABASE_URL
  type: 'stdio',
  command: 'npx',
  args: ['@anthropic-ai/mcp-server-postgres'],
  env: {
    DATABASE_URL: '${DATABASE_URL}',
  },
};

/**
 * Slack MCP Server - Notifications
 */
export const slackServer: SSEMCPServer = {
  name: 'slack',
  description: 'Slack notifications and messaging',
  enabled: false, // Requires SLACK_TOKEN
  type: 'sse',
  url: 'https://mcp.slack.com/sse',
  headers: {
    Authorization: 'Bearer ${SLACK_TOKEN}',
  },
};

/**
 * Default MCP configuration
 */
export const mcpConfig: MCPConfig = {
  browser: {
    defaultTimeout: 30000,
    headless: true,
    viewport: {
      width: 1280,
      height: 720,
    },
    screenshotDir: '.agent/screenshots',
  },
  servers: {
    playwright: playwrightServer,
    github: githubServer,
    filesystem: filesystemServer,
    postgres: postgresServer,
    slack: slackServer,
  },
};

/**
 * Get enabled MCP servers for SDK
 */
export function getEnabledServersForSDK(): Record<string, object> {
  const enabled: Record<string, object> = {};

  for (const [name, server] of Object.entries(mcpConfig.servers)) {
    if (!server.enabled) continue;

    if (server.type === 'stdio') {
      const stdioServer = server as StdioMCPServer;

      // Replace environment variable placeholders
      const env: Record<string, string> = {};
      if (stdioServer.env) {
        for (const [key, value] of Object.entries(stdioServer.env)) {
          const match = value.match(/\$\{(\w+)\}/);
          if (match?.[1]) {
            const envVar = process.env[match[1]];
            if (envVar) {
              env[key] = envVar;
            }
          } else {
            env[key] = value;
          }
        }
      }

      enabled[name] = {
        command: stdioServer.command,
        args: stdioServer.args,
        ...(Object.keys(env).length > 0 && { env }),
      };
    } else if (server.type === 'sse') {
      const sseServer = server as SSEMCPServer;

      // Replace header placeholders
      const headers: Record<string, string> = {};
      if (sseServer.headers) {
        for (const [key, value] of Object.entries(sseServer.headers)) {
          const match = value.match(/\$\{(\w+)\}/);
          if (match?.[1]) {
            const envVar = process.env[match[1]];
            if (envVar) {
              headers[key] = value.replace(`\${${match[1]}}`, envVar);
            }
          } else {
            headers[key] = value;
          }
        }
      }

      enabled[name] = {
        type: 'sse',
        url: sseServer.url,
        ...(Object.keys(headers).length > 0 && { headers }),
      };
    }
  }

  return enabled;
}

/**
 * Enable/disable MCP server
 */
export function setServerEnabled(serverName: string, enabled: boolean): boolean {
  const server = mcpConfig.servers[serverName];
  if (!server) return false;

  server.enabled = enabled;
  return true;
}

/**
 * Check if required environment variables are set for a server
 */
export function checkServerRequirements(serverName: string): {
  ready: boolean;
  missing: string[];
} {
  const server = mcpConfig.servers[serverName];
  if (!server) {
    return { ready: false, missing: ['Server not found'] };
  }

  const missing: string[] = [];

  if (server.type === 'stdio') {
    const stdioServer = server as StdioMCPServer;
    if (stdioServer.env) {
      for (const value of Object.values(stdioServer.env)) {
        const match = value.match(/\$\{(\w+)\}/);
        if (match?.[1] && !process.env[match[1]]) {
          missing.push(match[1]);
        }
      }
    }
  } else if (server.type === 'sse') {
    const sseServer = server as SSEMCPServer;
    if (sseServer.headers) {
      for (const value of Object.values(sseServer.headers)) {
        const match = value.match(/\$\{(\w+)\}/);
        if (match?.[1] && !process.env[match[1]]) {
          missing.push(match[1]);
        }
      }
    }
  }

  return { ready: missing.length === 0, missing };
}

/**
 * Get browser automation instructions for the agent prompt
 */
export function getBrowserInstructions(): string {
  return `
BROWSER AUTOMATION (via Playwright MCP):
- Use the mcp__playwright__* tools for browser interaction
- Navigate: mcp__playwright__navigate
- Click: mcp__playwright__click
- Type: mcp__playwright__fill
- Screenshot: mcp__playwright__screenshot
- Wait: mcp__playwright__wait_for_selector

TESTING WORKFLOW:
1. Start dev server using init script
2. Navigate to the application URL (http://localhost:3000 or 5173)
3. Perform test steps as defined in feature_list.json
4. Take screenshot for verification
5. Only mark feature as passing if ALL steps succeed

SETTINGS:
- Default timeout: ${mcpConfig.browser.defaultTimeout}ms
- Viewport: ${mcpConfig.browser.viewport.width}x${mcpConfig.browser.viewport.height}
- Screenshots saved to: ${mcpConfig.browser.screenshotDir}
`.trim();
}

/**
 * Get MCP servers summary for logging
 */
export function getMCPSummary(): string {
  const lines: string[] = ['MCP Servers:'];

  for (const [name, server] of Object.entries(mcpConfig.servers)) {
    const status = server.enabled ? '✓' : '✗';
    const requirements = checkServerRequirements(name);
    const ready = requirements.ready ? '' : ` (missing: ${requirements.missing.join(', ')})`;
    lines.push(`  ${status} ${name}: ${server.description}${ready}`);
  }

  return lines.join('\n');
}

export default mcpConfig;
