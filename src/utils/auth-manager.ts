/**
 * Authentication Manager
 * Handles user authentication, credential storage, and subscription validation.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { createInterface } from 'readline';
import open from 'open';
import {
  authConfig,
  AUTH_ENV_VARS,
  type UserCredentials,
  type AuthSession,
  type AuthMethod,
  type SubscriptionTier,
  type AuthSource,
} from '../config/auth-config.js';
import { detectClaudeCodeCredentials, getDaysUntilExpiration, getClaudeCodePaths } from './claude-code-detector.js';
import { isTokenExpired, refreshSubscriptionToken } from './token-refresh.js';

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

    // CRITICAL: On Windows, mode parameter is ignored. Set permissions explicitly.
    if (process.platform === 'win32') {
      try {
        const { execSync } = require('child_process');
        // Remove inheritance and grant full control to current user only
        execSync(`icacls "${authConfig.credentialsPath}" /inheritance:r /grant:r "%USERNAME%:F"`, {
          stdio: 'ignore',
        });
      } catch (error) {
        console.warn('Warning: Could not set Windows file permissions for credentials file');
      }
    }

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
   * Get the API key synchronously (without token refresh)
   * Used for display and environment setting where refresh isn't needed
   */
  public getApiKeySync(): string | null {
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
   * Get the API key to use (from stored credentials or environment)
   * Automatically attempts to refresh expired tokens
   */
  public async getApiKey(): Promise<string | null> {
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
      // Check if token is expired
      if (isTokenExpired(credentials.expiresAt)) {
        console.log('Token expired, attempting refresh...');

        if (credentials.refreshToken && credentials.method === 'subscription') {
          // Attempt to refresh the token
          const refreshed = await refreshSubscriptionToken(credentials.refreshToken);

          if (refreshed) {
            this.saveCredentials(refreshed);
            console.log('✓ Token refreshed successfully');
            return refreshed.subscriptionKey || refreshed.apiKey || null;
          } else {
            console.error('✗ Token refresh failed');
          }
        }

        // If we reach here, refresh failed or not possible
        console.error('Token expired and could not be refreshed. Please run: monty login');
        return null;
      }

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
    const apiKey = this.getApiKeySync();

    return {
      authenticated: this.isAuthenticated(),
      method: this.getAuthMethod(),
      email: credentials?.email || null,
      tier: credentials?.tier || null,
      keyPreview: apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : null,
    };
  }

  /**
   * Attempt to auto-detect Claude Code subscription credentials
   * Checks paths defined in authConfig.claudeCodePaths
   */
  public async autoDetectClaudeCode(): Promise<boolean> {
    console.log('Checking for existing Claude Code subscription credentials...');
    console.log('  Checking paths:', getClaudeCodePaths().join(', '));
    
    try {
      const claudeCreds = await detectClaudeCodeCredentials();
      
      if (claudeCreds) {
        console.log('✓ Found Claude Code subscription credentials!');
        
        const daysRemaining = getDaysUntilExpiration(claudeCreds.expiresAt);
        if (daysRemaining !== null) {
          console.log(`✓ Token is valid (expires in ${daysRemaining} days)`);
        } else {
          console.log('✓ Token is valid');
        }

        // Determine tier from credentials if available
        const tier: SubscriptionTier = (claudeCreds.tier as SubscriptionTier) || 'pro';

        const credentials: UserCredentials = {
          method: 'subscription',
          source: 'auto-detect',
          subscriptionKey: claudeCreds.accessToken,
          refreshToken: claudeCreds.refreshToken,
          tier,
          userId: `user_${Date.now()}`,
          // Normalize expiresAt to milliseconds
          expiresAt: claudeCreds.expiresAt 
            ? (claudeCreds.expiresAt > 1e12 ? claudeCreds.expiresAt : claudeCreds.expiresAt * 1000)
            : undefined,
        };

        this.saveCredentials(credentials);
        console.log('✓ Imported successfully');
        return true;
      }
      
      console.log('No Claude Code subscription credentials found.');
      return false;
    } catch (error) {
      console.error('Error detecting Claude Code credentials:', error);
      return false;
    }
  }

  /**
   * Interactive login flow
   * Supports:
   * 1. Auto-detection of Claude Code subscription credentials
   * 2. OAuth login via claude.ai (for Pro/Max/Team/Enterprise subscribers)
   * 3. Manual Anthropic API key entry
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
      // Auto-detect first if no specific method requested
      if (!options?.method && !options?.key) {
        const autoDetected = await this.autoDetectClaudeCode();
        if (autoDetected) {
          rl.close();
          return true;
        }
      }

      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║              Monty Agent Authentication                       ║');
      console.log('╚══════════════════════════════════════════════════════════════╝\n');

      let method: AuthMethod = options?.method || 'subscription';
      let key: string = options?.key || '';
      let email: string = options?.email || '';
      let source: AuthSource = 'manual';

      // If method not provided, ask user
      if (!options?.method) {
        console.log('Select authentication method:\n');
        console.log('  1. Login with Claude Subscription (Pro/Max/Team/Enterprise) - Recommended');
        console.log('     Uses Claude Code CLI to authenticate with your claude.ai account\n');
        console.log('  2. Use Anthropic API Key (from console.anthropic.com)');
        console.log('     For developers with API access\n');

        const choice = await question('Enter choice (1 or 2): ');

        if (choice === '2') {
          method = 'api_key';
        } else {
          method = 'subscription';
        }
      }

      // Handle subscription login via Claude Code CLI
      if (!key && method === 'subscription') {
        console.log('\n─────────────────────────────────────────────────────────────');
        console.log('  Claude Subscription Login');
        console.log('─────────────────────────────────────────────────────────────\n');
        
        console.log('To authenticate with your Claude subscription:\n');
        console.log('  Step 1: Run "claude login" in your terminal');
        console.log('          This will open a browser to authenticate with claude.ai\n');
        console.log('  Step 2: After authenticating, run "monty login" again');
        console.log('          Monty will automatically detect your credentials\n');
        
        const proceed = await question('Have you already run "claude login"? (y/N): ');
        
        if (proceed.toLowerCase() === 'y') {
          // Try auto-detection again
          console.log('\nRe-checking for Claude Code credentials...');
          const detected = await this.autoDetectClaudeCode();
          if (detected) {
            rl.close();
            return true;
          }
          console.log('\nStill no credentials found. Please ensure "claude login" completed successfully.\n');
        }
        
        const openClaude = await question('Would you like to open Claude Code installation page? (y/N): ');
        if (openClaude.toLowerCase() === 'y') {
          try {
            await open('https://docs.anthropic.com/en/docs/claude-code/getting-started');
            console.log('✓ Browser opened to Claude Code documentation\n');
          } catch {
            console.log('Could not open browser. Visit: https://docs.anthropic.com/en/docs/claude-code/getting-started\n');
          }
        }
        
        const useApiKey = await question('Would you like to use an Anthropic API key instead? (y/N): ');
        if (useApiKey.toLowerCase() === 'y') {
          method = 'api_key';
        } else {
          console.log('\nPlease run "claude login" first, then try "monty login" again.\n');
          rl.close();
          return false;
        }
      }

      // Get API key manually
      if (!key && method === 'api_key') {
        console.log('\n─────────────────────────────────────────────────────────────');
        console.log('  Anthropic API Key Entry');
        console.log('─────────────────────────────────────────────────────────────\n');
        console.log('To get your Anthropic API key:');
        console.log('  1. Go to https://console.anthropic.com/settings/keys');
        console.log('  2. Create a new key or copy an existing one\n');
        
        const openBrowser = await question('Open browser to get API key? (y/N): ');
        if (openBrowser.toLowerCase() === 'y') {
          try {
            await open('https://console.anthropic.com/settings/keys');
            console.log('✓ Browser opened to Anthropic Console\n');
          } catch {
            console.log('Could not open browser. Please visit the URL manually.\n');
          }
        }
        
        key = await question('API key (sk-ant-...): ');
        source = 'manual';
      }

      // Validate key format
      if (!key || key.length < 20) {
        console.log('\n✗ Error: Invalid key format. Key appears too short.');
        rl.close();
        return false;
      }

      // Optional: get email for display purposes
      if (!email) {
        email = await question('\nEmail (optional, press Enter to skip): ');
      }

      // Validate the key by making a test API call
      console.log('\nValidating credentials...');
      const isValid = await this.validateKey(key);

      if (!isValid) {
        console.log('\n✗ Error: Could not validate credentials. Please check your key and try again.');
        rl.close();
        return false;
      }

      console.log('✓ Credentials validated');

      // Save credentials
      const credentials: UserCredentials = {
        method,
        source,
        ...(method === 'subscription' ? { subscriptionKey: key } : { apiKey: key }),
        email: email || undefined,
        tier: 'pro', // Default, would be fetched from API in production
        userId: `user_${Date.now()}`,
      };

      this.saveCredentials(credentials);

      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('                    ✓ Login Successful!');
      console.log('═══════════════════════════════════════════════════════════════\n');
      console.log(`  Method: ${method === 'subscription' ? 'Claude Subscription' : 'Anthropic API Key'}`);
      console.log(`  Source: ${source}`);
      if (email) {
        console.log(`  Email:  ${email}`);
      }
      console.log(`  Key:    ${key.slice(0, 8)}...${key.slice(-4)}`);
      console.log('\n  Credentials saved to: ~/.monty/credentials.json');
      console.log('\n  You can now run "monty init" or "monty code" to start.\n');

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
    const credentials = this.loadCredentials();

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                 Monty Agent - Current User                   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    if (!info.authenticated) {
      console.log('  Status: Not authenticated\n');
      console.log('  Run "monty login" to authenticate.\n');
      return;
    }

    console.log('  Status: ✓ Authenticated');
    console.log(`  Method: ${info.method === 'subscription' ? 'Claude Subscription' : 'Anthropic API Key'}`);

    if (credentials?.source) {
      console.log(`  Source: ${credentials.source}`);
    }

    if (info.email) {
      console.log(`  Email:  ${info.email}`);
    }

    if (info.tier) {
      const tierDisplay = info.tier.charAt(0).toUpperCase() + info.tier.slice(1);
      console.log(`  Tier:   ${tierDisplay}`);
    }

    if (info.keyPreview) {
      console.log(`  Key:    ${info.keyPreview}`);
    }

    // Check if using environment variable
    if (process.env[AUTH_ENV_VARS.SUBSCRIPTION_KEY] || process.env[AUTH_ENV_VARS.API_KEY]) {
      console.log('\n  Note: Using credentials from environment variable');
    } else {
      console.log('\n  Credentials: ~/.monty/credentials.json');
    }

    console.log('');
  }

  /**
   * Set environment variable for child processes
   */
  public setEnvForChildProcess(): void {
    const apiKey = this.getApiKeySync();
    if (apiKey) {
      // SDK only reads ANTHROPIC_API_KEY, so just set that one variable
      process.env[AUTH_ENV_VARS.API_KEY] = apiKey;

      // Log which authentication method is being used (for debugging)
      const method = this.getAuthMethod();
      if (method === 'subscription') {
        console.log('✓ Authentication configured: Claude subscription');
      } else if (method === 'api_key') {
        console.log('✓ Authentication configured: API key');
      } else {
        console.log('✓ Authentication configured');
      }
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
  return authManager.getApiKeySync();
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
