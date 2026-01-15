/**
 * Authentication Configuration
 * Configuration for Claude Code Anthropic subscription authentication.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { join } from 'path';
import { homedir } from 'os';

/**
 * Authentication method types
 */
export type AuthMethod = 'api_key' | 'subscription' | 'oauth';

/**
 * Subscription tier levels
 */
export type SubscriptionTier = 'free' | 'pro' | 'team' | 'enterprise';

/**
 * User credentials interface
 */
export interface UserCredentials {
  method: AuthMethod;
  apiKey?: string;
  subscriptionKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
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
  /** Anthropic OAuth endpoints (for future OAuth support) */
  oauth: {
    authorizationUrl: string;
    tokenUrl: string;
    clientId: string;
    redirectUri: string;
    scopes: string[];
  };
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
    // Anthropic OAuth endpoints (placeholder - will be updated when available)
    authorizationUrl: 'https://console.anthropic.com/oauth/authorize',
    tokenUrl: 'https://console.anthropic.com/oauth/token',
    clientId: 'monty-fullstack-agent',
    redirectUri: 'http://localhost:9876/callback',
    scopes: ['read', 'write', 'agent'],
  },
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
