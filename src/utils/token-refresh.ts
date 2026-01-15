/**
 * Token Refresh Utility
 * Handles token expiration checking and refresh for subscription-based authentication
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { UserCredentials } from '../config/auth-config.js';

const execAsync = promisify(exec);

// 5 minute grace period before token expiration
const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Check if a token is expired (with 5-minute grace period)
 */
export function isTokenExpired(expiresAt: number | undefined): boolean {
  if (!expiresAt) {
    return false; // No expiration = never expires
  }

  // Normalize timestamp to milliseconds if it's in seconds
  const expiresAtMs = expiresAt > 1e12 ? expiresAt : expiresAt * 1000;

  // Check if expired (with 5-minute buffer)
  return Date.now() > (expiresAtMs - FIVE_MINUTES_MS);
}

/**
 * Refresh an expired subscription token using Claude CLI
 *
 * This uses the Claude CLI's built-in token refresh capability.
 * The Claude CLI handles the OAuth refresh flow with Anthropic's servers.
 */
export async function refreshSubscriptionToken(
  refreshToken: string
): Promise<UserCredentials | null> {
  try {
    // Use Claude CLI to refresh the token
    // The CLI handles OAuth token exchange with Anthropic
    const { stdout } = await execAsync('claude auth refresh', {
      timeout: 10000, // 10 second timeout
    });

    const config = JSON.parse(stdout);

    if (config.accessToken || config.access_token) {
      return {
        method: 'subscription',
        source: 'auto-detect',
        subscriptionKey: config.accessToken || config.access_token,
        refreshToken: config.refreshToken || config.refresh_token,
        expiresAt: config.expiresAt || config.expires_at,
        tier: config.tier || config.subscription_tier || 'pro',
        userId: config.userId || config.user_id || `user_${Date.now()}`,
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to refresh token:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Get human-readable time until token expiration
 */
export function getTimeUntilExpiration(expiresAt: number | undefined): string {
  if (!expiresAt) {
    return 'Never';
  }

  const expiresAtMs = expiresAt > 1e12 ? expiresAt : expiresAt * 1000;
  const msRemaining = expiresAtMs - Date.now();

  if (msRemaining <= 0) {
    return 'Expired';
  }

  const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.floor((msRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (daysRemaining > 0) {
    return `${daysRemaining} day${daysRemaining > 1 ? 's' : ''}`;
  }

  if (hoursRemaining > 0) {
    return `${hoursRemaining} hour${hoursRemaining > 1 ? 's' : ''}`;
  }

  const minutesRemaining = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
  return `${minutesRemaining} minute${minutesRemaining > 1 ? 's' : ''}`;
}
