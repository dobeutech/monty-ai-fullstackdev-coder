import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { authConfig } from '../config/auth-config.js';

const execAsync = promisify(exec);

/**
 * Claude Code Credential Detector
 * Detects existing Claude Code subscription credentials from the local system.
 * 
 * Claude Code stores credentials in different locations depending on OS:
 * - Linux/Windows: ~/.config/claude-code/auth.json
 * - macOS: Uses Keychain (encrypted) - we check file fallbacks
 * - Alternative: ~/.claude/credentials.json or ~/.claude/auth.json
 */

export interface ClaudeCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
  tier?: string;
}

/**
 * Get all possible paths where Claude Code might store credentials
 */
function getCredentialPaths(): string[] {
  // Use paths from config, plus some additional fallbacks
  const paths = [
    ...authConfig.claudeCodePaths,
    join(homedir(), '.claude', 'token.json'),              // Legacy location
    join(homedir(), '.config', 'claude', 'auth.json'),     // Alternative config location
  ];
  
  // Remove duplicates
  return [...new Set(paths)];
}

/**
 * Try to parse credentials from a file
 */
function tryParseCredentials(filePath: string): ClaudeCredentials | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }

    const fileContent = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    // Handle different credential file formats
    // Format 1: Direct token format
    if (data.accessToken || data.access_token) {
      return {
        accessToken: data.accessToken || data.access_token,
        refreshToken: data.refreshToken || data.refresh_token,
        expiresAt: data.expiresAt || data.expires_at,
        tokenType: data.tokenType || data.token_type || 'Bearer',
        scope: data.scope,
        tier: data.tier || data.subscription_tier,
      };
    }

    // Format 2: Nested under 'credentials' key
    if (data.credentials) {
      return {
        accessToken: data.credentials.accessToken || data.credentials.access_token,
        refreshToken: data.credentials.refreshToken || data.credentials.refresh_token,
        expiresAt: data.credentials.expiresAt || data.credentials.expires_at,
        tokenType: data.credentials.tokenType || data.credentials.token_type || 'Bearer',
        scope: data.credentials.scope,
        tier: data.credentials.tier || data.credentials.subscription_tier,
      };
    }

    // Format 3: OAuth token format
    if (data.token) {
      return {
        accessToken: data.token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
        tokenType: 'Bearer',
        tier: data.tier,
      };
    }

    return null;
  } catch (error) {
    // File exists but couldn't be parsed
    return null;
  }
}

/**
 * Detects existing Claude Code subscription credentials from the local system
 * Priority:
 * 1. Use `claude config show` command (handles Keychain/Credential Manager/files automatically)
 * 2. Fall back to file-based detection
 */
export async function detectClaudeCodeCredentials(): Promise<ClaudeCredentials | null> {
  // Try to use Claude CLI directly - it handles all platform-specific storage (Keychain, etc.)
  try {
    const { stdout } = await execAsync('claude config show --format json', {
      timeout: 5000, // 5 second timeout
    });

    const config = JSON.parse(stdout);

    if (config.accessToken || config.access_token) {
      const credentials: ClaudeCredentials = {
        accessToken: config.accessToken || config.access_token,
        refreshToken: config.refreshToken || config.refresh_token,
        expiresAt: config.expiresAt || config.expires_at,
        tier: config.tier || config.subscription_tier,
      };

      // Check if token is expired
      if (!isTokenExpired(credentials)) {
        return credentials;
      }
    }
  } catch (error) {
    // Claude CLI not installed, not authenticated, or command failed - try file-based detection
  }

  // Fallback: Try file-based detection for users without Claude CLI or using file storage
  return await detectFromFiles();
}

/**
 * Legacy file-based credential detection (fallback)
 */
async function detectFromFiles(): Promise<ClaudeCredentials | null> {
  const paths = getCredentialPaths();

  for (const path of paths) {
    const credentials = tryParseCredentials(path);

    if (credentials && credentials.accessToken) {
      // Check if token is expired
      if (credentials.expiresAt && isTokenExpired(credentials)) {
        console.log(`  Found credentials at ${path} but token is expired`);
        continue;
      }

      return credentials;
    }
  }

  return null;
}

/**
 * Checks if a token is expired
 */
export function isTokenExpired(tokenData: { expiresAt?: number }): boolean {
  if (!tokenData.expiresAt) {
    return false; // Assume valid if no expiry
  }
  
  // Check if expiresAt is in seconds or milliseconds
  const expiresAtMs = tokenData.expiresAt > 1e12 
    ? tokenData.expiresAt 
    : tokenData.expiresAt * 1000;
  
  // Add 5 minute buffer
  return Date.now() >= expiresAtMs - (5 * 60 * 1000);
}

/**
 * Get days remaining until token expiration
 */
export function getDaysUntilExpiration(expiresAt?: number): number | null {
  if (!expiresAt) return null;
  
  const expiresAtMs = expiresAt > 1e12 ? expiresAt : expiresAt * 1000;
  const msRemaining = expiresAtMs - Date.now();
  
  if (msRemaining <= 0) return 0;
  
  return Math.floor(msRemaining / (1000 * 60 * 60 * 24));
}

/**
 * Get all paths that are checked for Claude Code credentials
 */
export function getClaudeCodePaths(): string[] {
  return getCredentialPaths();
}
