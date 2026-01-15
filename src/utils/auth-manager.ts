/**
 * Authentication Manager
 * Handles user authentication, credential storage, and subscription validation.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { createInterface } from 'readline';
import {
  authConfig,
  AUTH_ENV_VARS,
  type UserCredentials,
  type AuthSession,
  type AuthMethod,
  type SubscriptionTier,
} from '../config/auth-config.js';

/**
 * AuthManager - Singleton for managing authentication state
 */
export class AuthManager {
  private static instance: AuthManager;
  private session: AuthSession;

  private constructor() {
    this.session = {
      isAuthenticated: false,
      credentials: null,
      lastValidated: null,
    };
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  /**
   * Ensure the config directory exists
   */
  private ensureConfigDir(): void {
    if (!existsSync(authConfig.configDir)) {
      mkdirSync(authConfig.configDir, { recursive: true });
    }
  }

  /**
   * Load credentials from file
   */
  public loadCredentials(): UserCredentials | null {
    try {
      if (existsSync(authConfig.credentialsPath)) {
        const data = readFileSync(authConfig.credentialsPath, 'utf-8');
        return JSON.parse(data) as UserCredentials;
      }
    } catch (error) {
      console.error('Failed to load credentials:', error);
    }
    return null;
  }

  /**
   * Save credentials to file
   */
  public saveCredentials(credentials: UserCredentials): void {
    this.ensureConfigDir();
    // Store credentials with restricted permissions (0600)
    writeFileSync(authConfig.credentialsPath, JSON.stringify(credentials, null, 2), {
      mode: 0o600,
    });
    this.session.credentials = credentials;
    this.session.isAuthenticated = true;
    this.session.lastValidated = Date.now();
  }

  /**
   * Clear stored credentials (logout)
   */
  public clearCredentials(): void {
    try {
      if (existsSync(authConfig.credentialsPath)) {
        unlinkSync(authConfig.credentialsPath);
      }
      if (existsSync(authConfig.sessionPath)) {
        unlinkSync(authConfig.sessionPath);
      }
    } catch (error) {
      // Ignore errors during cleanup
    }
    this.session = {
      isAuthenticated: false,
      credentials: null,
      lastValidated: null,
    };
  }

  /**
   * Check if user is authenticated (from file or environment)
   */
  public isAuthenticated(): boolean {
    // Check environment variables first
    if (process.env[AUTH_ENV_VARS.API_KEY] || process.env[AUTH_ENV_VARS.SUBSCRIPTION_KEY]) {
      return true;
    }

    // Check stored credentials
    const credentials = this.loadCredentials();
    if (credentials) {
      // Check if token is expired
      if (credentials.expiresAt && credentials.expiresAt < Date.now()) {
        return false;
      }
      this.session.credentials = credentials;
      this.session.isAuthenticated = true;
      return true;
    }

    return false;
  }

  /**
   * Get the API key to use (from stored credentials or environment)
   */
  public getApiKey(): string | null {
    // Priority: env var > stored subscription key > stored API key
    const subscriptionKey = process.env[AUTH_ENV_VARS.SUBSCRIPTION_KEY];
    if (subscriptionKey) {
      return subscriptionKey;
    }
    const apiKey = process.env[AUTH_ENV_VARS.API_KEY];
    if (apiKey) {
      return apiKey;
    }

    const credentials = this.loadCredentials();
    if (credentials) {
      return credentials.subscriptionKey || credentials.apiKey || null;
    }

    return null;
  }

  /**
   * Get current auth method
   */
  public getAuthMethod(): AuthMethod | null {
    if (process.env[AUTH_ENV_VARS.SUBSCRIPTION_KEY]) {
      return 'subscription';
    }
    if (process.env[AUTH_ENV_VARS.API_KEY]) {
      return 'api_key';
    }

    const credentials = this.loadCredentials();
    return credentials?.method || null;
  }

  /**
   * Get user info for display
   */
  public getUserInfo(): {
    authenticated: boolean;
    method: AuthMethod | null;
    email: string | null;
    tier: SubscriptionTier | null;
    keyPreview: string | null;
  } {
    const credentials = this.loadCredentials();
    const apiKey = this.getApiKey();

    return {
      authenticated: this.isAuthenticated(),
      method: this.getAuthMethod(),
      email: credentials?.email || null,
      tier: credentials?.tier || null,
      keyPreview: apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : null,
    };
  }

  /**
   * Interactive login flow - prompts for API key or subscription key
   */
  public async login(options?: {
    method?: AuthMethod;
    key?: string;
    email?: string;
  }): Promise<boolean> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = (prompt: string): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
          resolve(answer.trim());
        });
      });
    };

    try {
      console.log('\n========================================');
      console.log('      Monty Agent Authentication');
      console.log('========================================\n');

      let method: AuthMethod = options?.method || 'subscription';
      let key: string = options?.key || '';
      let email: string = options?.email || '';

      // If method not provided, ask user
      if (!options?.method) {
        console.log('Select authentication method:');
        console.log('  1. Claude Code Subscription Key (Recommended)');
        console.log('  2. Anthropic API Key');
        console.log('');

        const choice = await question('Enter choice (1 or 2): ');

        if (choice === '2') {
          method = 'api_key';
        } else {
          method = 'subscription';
        }
      }

      // Get the key
      if (!key) {
        if (method === 'subscription') {
          console.log('\nTo get your Claude Code subscription key:');
          console.log('  1. Go to https://claude.ai/settings/api');
          console.log('  2. Copy your subscription key');
          console.log('');
          key = await question('Enter your Claude Code subscription key: ');
        } else {
          console.log('\nTo get your Anthropic API key:');
          console.log('  1. Go to https://console.anthropic.com/settings/keys');
          console.log('  2. Create or copy an existing API key');
          console.log('');
          key = await question('Enter your Anthropic API key: ');
        }
      }

      // Validate key format
      if (!key || key.length < 20) {
        console.log('\nError: Invalid key format. Key appears too short.');
        rl.close();
        return false;
      }

      // Optional: get email for display purposes
      if (!email) {
        email = await question('Enter your email (optional, press Enter to skip): ');
      }

      // Validate the key by making a test API call
      console.log('\nValidating credentials...');
      const isValid = await this.validateKey(key);

      if (!isValid) {
        console.log('\nError: Could not validate credentials. Please check your key and try again.');
        rl.close();
        return false;
      }

      // Save credentials
      const credentials: UserCredentials = {
        method,
        ...(method === 'subscription' ? { subscriptionKey: key } : { apiKey: key }),
        email: email || undefined,
        tier: 'pro', // Default, would be fetched from API in production
        userId: `user_${Date.now()}`,
      };

      this.saveCredentials(credentials);

      console.log('\nSuccess! You are now logged in.');
      console.log(`  Method: ${method === 'subscription' ? 'Claude Code Subscription' : 'API Key'}`);
      if (email) {
        console.log(`  Email: ${email}`);
      }
      console.log(`  Key: ${key.slice(0, 8)}...${key.slice(-4)}`);
      console.log('\nYour credentials have been saved to ~/.monty/credentials.json');
      console.log('You can now run "monty init" or "monty code" to start using the agent.\n');

      rl.close();
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      rl.close();
      return false;
    }
  }

  /**
   * Validate an API key by making a test request
   */
  public async validateKey(key: string): Promise<boolean> {
    try {
      // Make a minimal API request to validate the key
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });

      // 200 = valid, 401 = invalid key, 400 = valid key but bad request (still valid)
      return response.status === 200 || response.status === 400;
    } catch (error) {
      // Network error - assume key might be valid, let actual usage fail if not
      console.warn('Could not validate key online, proceeding anyway...');
      return true;
    }
  }

  /**
   * Logout - clear credentials
   */
  public logout(): void {
    const wasAuthenticated = this.isAuthenticated();
    this.clearCredentials();

    if (wasAuthenticated) {
      console.log('\nYou have been logged out.');
      console.log('Your credentials have been removed from ~/.monty/credentials.json\n');
    } else {
      console.log('\nYou were not logged in.\n');
    }
  }

  /**
   * Display current auth status (whoami)
   */
  public whoami(): void {
    const info = this.getUserInfo();

    console.log('\n========================================');
    console.log('      Monty Agent - Current User');
    console.log('========================================\n');

    if (!info.authenticated) {
      console.log('Status: Not authenticated\n');
      console.log('Run "monty login" to authenticate.\n');
      return;
    }

    console.log('Status: Authenticated');
    console.log(`Method: ${info.method === 'subscription' ? 'Claude Code Subscription' : 'Anthropic API Key'}`);

    if (info.email) {
      console.log(`Email: ${info.email}`);
    }

    if (info.tier) {
      console.log(`Tier: ${info.tier}`);
    }

    if (info.keyPreview) {
      console.log(`Key: ${info.keyPreview}`);
    }

    // Check if using environment variable
    if (process.env[AUTH_ENV_VARS.SUBSCRIPTION_KEY] || process.env[AUTH_ENV_VARS.API_KEY]) {
      console.log('\nNote: Using credentials from environment variable');
    } else {
      console.log('\nCredentials stored in: ~/.monty/credentials.json');
    }

    console.log('');
  }

  /**
   * Set environment variable for child processes
   */
  public setEnvForChildProcess(): void {
    const apiKey = this.getApiKey();
    if (apiKey) {
      process.env[AUTH_ENV_VARS.API_KEY] = apiKey;
    }
  }

  /**
   * Check authentication and return status for CLI
   */
  public checkAuth(): {
    authenticated: boolean;
    message: string;
  } {
    if (this.isAuthenticated()) {
      return {
        authenticated: true,
        message: 'Authenticated',
      };
    }

    return {
      authenticated: false,
      message: `Not authenticated. Run "monty login" to sign in, or set ${AUTH_ENV_VARS.API_KEY} environment variable.`,
    };
  }
}

// Export singleton instance
export const authManager = AuthManager.getInstance();

// Export convenience functions
export function isAuthenticated(): boolean {
  return authManager.isAuthenticated();
}

export function getApiKey(): string | null {
  return authManager.getApiKey();
}

export function login(options?: { method?: AuthMethod; key?: string; email?: string }): Promise<boolean> {
  return authManager.login(options);
}

export function logout(): void {
  authManager.logout();
}

export function whoami(): void {
  authManager.whoami();
}

export function checkAuth(): { authenticated: boolean; message: string } {
  return authManager.checkAuth();
}

export function setEnvForChildProcess(): void {
  authManager.setEnvForChildProcess();
}

export default authManager;
