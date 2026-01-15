/**
 * Authentication Configuration
 * Configuration for Claude subscription and Anthropic API authentication.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { join } from 'path';
import { homedir } from 'os';

/**
 * Authentication method types
 * - subscription: Claude.ai subscription (Pro/Max/Team/Enterprise) via OAuth
 * - api_key: Anthropic API key from console.anthropic.com
 */
export type AuthMethod = 'api_key' | 'subscription';

/**
 * Authentication source - how credentials were obtained
 */
export type AuthSource = 'oauth' | 'auto-detect' | 'manual';

/**
 * Subscription tier levels
 */
export type SubscriptionTier = 'free' | 'pro' | 'max' | 'team' | 'enterprise';

/**
 * User credentials interface
 */
export interface UserCredentials {
  method: AuthMethod;
  source?: AuthSource;
  apiKey?: string;              // For api_key method
  subscriptionKey?: string;     // For subscription method (OAuth token)
  accessToken?: string;         // OAuth access token
  refreshToken?: string;        // OAuth refresh token
  expiresAt?: number;           // Token expiration timestamp (ms)
  userId?: string;
  email?: string;
  tier?: SubscriptionTier;
}

/**
 * Auth session state
 */
export interface AuthSession {
  isAuthenticated: boolean;
  credentials: UserCredentials | null;
  lastValidated: number | null;
}

/**
 * Auth configuration interface
 */
export interface AuthConfig {
  /** Path to store credentials */
  credentialsPath: string;
  /** Path to store session info */
  sessionPath: string;
  /** Config directory */
  configDir: string;
  /** Claude.ai subscription OAuth endpoints */
  oauth: {
    authorizationUrl: string;
    tokenUrl: string;
    clientId: string;
    redirectUri: string;
    scopes: string[];
  };
  /** Paths to check for Claude Code credentials (auto-detection) */
  claudeCodePaths: string[];
  /** Token validation settings */
  validation: {
    /** How often to revalidate credentials (ms) */
    revalidateInterval: number;
    /** Grace period before token expiry to refresh (ms) */
    refreshGracePeriod: number;
  };
  /** Supported authentication methods */
  supportedMethods: AuthMethod[];
}

// Get user's home config directory
const configDir = join(homedir(), '.monty');

/**
 * Default authentication configuration
 */
export const authConfig: AuthConfig = {
  credentialsPath: join(configDir, 'credentials.json'),
  sessionPath: join(configDir, 'session.json'),
  configDir,
  oauth: {
    // Claude.ai subscription OAuth endpoints
    authorizationUrl: 'https://claude.ai/oauth/authorize',
    tokenUrl: 'https://claude.ai/oauth/token',
    clientId: 'monty-fullstack-agent',
    redirectUri: 'http://localhost:9876/callback',
    scopes: ['subscription', 'agent'],
  },
  // Claude Code credential paths for auto-detection
  claudeCodePaths: [
    join(homedir(), '.config', 'claude-code', 'auth.json'),  // Linux/Windows standard
    join(homedir(), '.claude', 'credentials.json'),          // Alternative location
    join(homedir(), '.claude', 'auth.json'),                 // Alternative location
  ],
  validation: {
    revalidateInterval: 24 * 60 * 60 * 1000, // 24 hours
    refreshGracePeriod: 5 * 60 * 1000, // 5 minutes
  },
  supportedMethods: ['api_key', 'subscription'],
};

/**
 * Environment variable names for auth
 */
export const AUTH_ENV_VARS = {
  API_KEY: 'ANTHROPIC_API_KEY',
  SUBSCRIPTION_KEY: 'ANTHROPIC_SUBSCRIPTION_KEY',
  ACCESS_TOKEN: 'ANTHROPIC_ACCESS_TOKEN',
} as const;

/**
 * Get the credentials file path
 */
export function getCredentialsPath(): string {
  return authConfig.credentialsPath;
}

/**
 * Get the session file path
 */
export function getSessionPath(): string {
  return authConfig.sessionPath;
}

/**
 * Get the config directory path
 */
export function getConfigDir(): string {
  return authConfig.configDir;
}

export default authConfig;
