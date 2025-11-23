import { describe, expect, it } from 'vitest';
import { AuthorizationError, UnauthorizedError } from '../errors.js';
import { requireRecentAuth } from '../step-up.js';
import type { AuthContext } from '../types.js';

function buildAuthContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    sessionId: 'sess-1',
    clientType: 'web',
    activeWorkspaceId: null,
    scopes: [],
    roles: [],
    profileId: 'profile-1',
    mfaLevel: 'none',
    recentlyAuthenticatedAt: new Date(),
    ...overrides,
  };
}

describe('requireRecentAuth', () => {
  it('passes when within window and mfa level meets requirement', () => {
    const auth = buildAuthContext({
      recentlyAuthenticatedAt: new Date(),
      mfaLevel: 'mfa',
    });

    expect(() =>
      requireRecentAuth(auth, { withinSeconds: 600, minMfaLevel: 'none' })
    ).not.toThrow();
  });

  it('throws UnauthorizedError when auth is null', () => {
    expect(() => requireRecentAuth(null)).toThrow(UnauthorizedError);
  });

  it('throws AuthorizationError when MFA level is too low', () => {
    const auth = buildAuthContext({ mfaLevel: 'none' });
    expect(() =>
      requireRecentAuth(auth, { minMfaLevel: 'mfa', withinSeconds: 600 })
    ).toThrow(AuthorizationError);
  });

  it('throws AuthorizationError when outside the recent window', () => {
    const auth = buildAuthContext({
      recentlyAuthenticatedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    expect(() => requireRecentAuth(auth, { withinSeconds: 600 })).toThrow(AuthorizationError);
  });
});
