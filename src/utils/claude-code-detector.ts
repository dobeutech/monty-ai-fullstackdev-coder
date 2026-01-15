import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync } from 'fs';

// Cross-platform path to Claude Code credentials
const CLAUDE_CONFIG_DIR = join(homedir(), '.claude');
const CLAUDE_TOKEN_FILE = join(CLAUDE_CONFIG_DIR, 'token.json');

export interface ClaudeCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
}

/**
 * Detects existing Claude Code credentials from the local system
 */
export async function detectClaudeCodeCredentials(): Promise<ClaudeCredentials | null> {
  try {
    // Check if token file exists
    if (!existsSync(CLAUDE_TOKEN_FILE)) {
      return null;
    }

    // Read and parse token file
    const tokenData = JSON.parse(readFileSync(CLAUDE_TOKEN_FILE, 'utf-8'));

    // Basic validation of token structure
    if (!tokenData || !tokenData.accessToken) {
      return null;
    }

    // Check expiration if present
    if (tokenData.expiresAt && isTokenExpired(tokenData)) {
      return null;
    }

    return {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: tokenData.expiresAt,
      tokenType: tokenData.tokenType,
      scope: tokenData.scope,
    };
  } catch (error) {
    // Silently fail if detection fails
    return null;
  }
}

/**
 * Checks if a token is expired
 */
export function isTokenExpired(tokenData: { expiresAt?: number }): boolean {
  if (!tokenData.expiresAt) {
    return false; // Assume valid if no expiry
  }
  
  // Add 5 minute buffer
  return Date.now() >= (tokenData.expiresAt * 1000) - (5 * 60 * 1000);
}

/**
 * Get the detected Claude Code directory path
 */
export function getClaudeCodeDir(): string {
  return CLAUDE_CONFIG_DIR;
}
