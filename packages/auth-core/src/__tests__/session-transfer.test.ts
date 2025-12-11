import { describe, expect, it } from 'vitest';
import {
  SESSION_TRANSFER_TTL_SECONDS,
  generateSessionTransferToken,
  parseSessionTransferToken,
  verifySessionTransferToken,
} from '../session-transfer.js';

describe('Session transfer tokens', () => {
  it('generates token with st_ prefix and envelope', () => {
    const tokenData = generateSessionTransferToken();

    expect(tokenData.token).toMatch(/^st_/);
    expect(tokenData.tokenId).toBeDefined();
    expect(tokenData.hashEnvelope.hash).toBeDefined();
    expect(tokenData.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('parses a valid token', () => {
    const tokenData = generateSessionTransferToken();
    const parsed = parseSessionTransferToken(tokenData.token);

    expect(parsed).not.toBeNull();
    expect(parsed?.tokenId).toBe(tokenData.tokenId);
  });

  it('rejects invalid prefix', () => {
    const parsed = parseSessionTransferToken('invalid_token');
    expect(parsed).toBeNull();
  });

  it('verifies secret against hash', () => {
    const tokenData = generateSessionTransferToken();
    const parsed = parseSessionTransferToken(tokenData.token);

    expect(parsed).not.toBeNull();
    const isValid = verifySessionTransferToken(parsed?.tokenSecret ?? '', tokenData.hashEnvelope);
    expect(isValid).toBe(true);
  });

  it('rejects wrong secret', () => {
    const tokenData = generateSessionTransferToken();
    const parsed = parseSessionTransferToken(tokenData.token);

    expect(parsed).not.toBeNull();
    const isValid = verifySessionTransferToken('wrong-secret', tokenData.hashEnvelope);
    expect(isValid).toBe(false);
  });

  it('sets TTL to 2 minutes', () => {
    const tokenData = generateSessionTransferToken();
    const ttlSeconds = Math.round((tokenData.expiresAt.getTime() - Date.now()) / 1000);
    expect(ttlSeconds).toBeLessThanOrEqual(SESSION_TRANSFER_TTL_SECONDS);
    expect(ttlSeconds).toBeGreaterThan(0);
  });
});
