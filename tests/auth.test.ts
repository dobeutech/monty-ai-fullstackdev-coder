/**
 * Authentication Tests
 * Basic tests for token expiration and auth logic
 */

import { describe, it, expect } from 'vitest';
import { isTokenExpired, getTimeUntilExpiration } from '../src/utils/token-refresh';

describe('Token Expiration', () => {
  it('should detect expired tokens', () => {
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    expect(isTokenExpired(yesterday)).toBe(true);
  });

  it('should not flag valid tokens', () => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    expect(isTokenExpired(tomorrow)).toBe(false);
  });

  it('should handle undefined expiration (never expires)', () => {
    expect(isTokenExpired(undefined)).toBe(false);
  });

  it('should use 5-minute grace period', () => {
    const fourMinutesFromNow = Date.now() + 4 * 60 * 1000;
    // Should be considered expired due to 5-minute grace period
    expect(isTokenExpired(fourMinutesFromNow)).toBe(true);

    const sixMinutesFromNow = Date.now() + 6 * 60 * 1000;
    // Should NOT be considered expired (outside grace period)
    expect(isTokenExpired(sixMinutesFromNow)).toBe(false);
  });

  it('should handle timestamps in seconds (not just milliseconds)', () => {
    const timestampInSeconds = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour from now in seconds
    expect(isTokenExpired(timestampInSeconds)).toBe(false);
  });
});

describe('Time Until Expiration Display', () => {
  it('should show "Never" for undefined expiration', () => {
    expect(getTimeUntilExpiration(undefined)).toBe('Never');
  });

  it('should show "Expired" for past timestamps', () => {
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    expect(getTimeUntilExpiration(yesterday)).toBe('Expired');
  });

  it('should show days for > 24 hours remaining', () => {
    const twoDaysFromNow = Date.now() + 2 * 24 * 60 * 60 * 1000;
    expect(getTimeUntilExpiration(twoDaysFromNow)).toBe('2 days');
  });

  it('should show hours for < 24 hours remaining', () => {
    const fiveHoursFromNow = Date.now() + 5 * 60 * 60 * 1000;
    expect(getTimeUntilExpiration(fiveHoursFromNow)).toBe('5 hours');
  });

  it('should show minutes for < 1 hour remaining', () => {
    const thirtyMinutesFromNow = Date.now() + 30 * 60 * 1000;
    expect(getTimeUntilExpiration(thirtyMinutesFromNow)).toBe('30 minutes');
  });
});
