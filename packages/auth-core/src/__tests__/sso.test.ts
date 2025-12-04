import { describe, expect, it } from 'vitest';
import { AuthorizationError } from '../errors.js';
import {
  isSsoProvider,
  normalizeSsoProvider,
  planBackChannelLogout,
  resolveSsoLoginUser,
  resolveSsoWorkspace,
} from '../sso.js';
import type { SessionSummary, VerifiedIdentity, WorkspaceSsoBinding } from '../types.js';

const samlProvider = 'saml:okta-main';

function binding(overrides: Partial<WorkspaceSsoBinding> = {}): WorkspaceSsoBinding {
  return {
    provider: samlProvider,
    workspaceId: 'workspace-1',
    mode: 'invite_only',
    allowedEmailDomains: ['example.com'],
    defaultRole: 'member',
    ...overrides,
  };
}

function identity(overrides: Partial<VerifiedIdentity> = {}): VerifiedIdentity {
  return {
    provider: samlProvider,
    providerSubject: 'user-123',
    email: 'user@example.com',
    emailVerified: true,
    ...overrides,
  };
}

describe('normalizeSsoProvider', () => {
  it('accepts supported prefixes', () => {
    expect(normalizeSsoProvider('saml:okta-main')).toBe('saml:okta-main');
    expect(normalizeSsoProvider('auth0:enterprise')).toBe('auth0:enterprise');
    expect(normalizeSsoProvider('oidc:partner')).toBe('oidc:partner');
  });

  it('rejects unsupported providers', () => {
    expect(() => normalizeSsoProvider('google')).toThrow(AuthorizationError);
  });

  it('detects supported providers', () => {
    expect(isSsoProvider('saml:foo')).toBe(true);
    expect(isSsoProvider('oidc:bar')).toBe(true);
    expect(isSsoProvider('auth0:bar')).toBe(true);
    expect(isSsoProvider('google')).toBe(false);
  });
});

describe('resolveSsoWorkspace', () => {
  it('returns workspace binding for matching provider', () => {
    const resolved = resolveSsoWorkspace(identity(), [binding()]);
    expect(resolved).toEqual({
      workspaceId: 'workspace-1',
      provider: samlProvider,
      mode: 'invite_only',
      defaultRole: 'member',
    });
  });

  it('rejects when domains are restricted and email is unverified', () => {
    expect(() =>
      resolveSsoWorkspace(identity({ emailVerified: false }), [
        binding({ allowedEmailDomains: ['example.com'] }),
      ])
    ).toThrow(AuthorizationError);
  });

  it('rejects duplicate provider bindings', () => {
    expect(() =>
      resolveSsoWorkspace(identity(), [binding(), binding({ workspaceId: 'workspace-2' })])
    ).toThrow(AuthorizationError);
  });

  it('returns null when provider is not configured', () => {
    const resolved = resolveSsoWorkspace(identity({ provider: 'saml:not-configured' }), [
      binding(),
    ]);
    expect(resolved).toBeNull();
  });
});

describe('planBackChannelLogout', () => {
  const sessions: SessionSummary[] = [
    { id: 'sess-1', userId: 'user-a', revokedAt: null },
    { id: 'sess-2', userId: 'user-b', revokedAt: null },
    { id: 'sess-3', userId: 'user-a', revokedAt: new Date() },
  ];

  it('collects user and active session ids for the logout event', () => {
    const plan = planBackChannelLogout(
      { provider: samlProvider, providerSubject: 'idp-1' },
      [
        { provider: samlProvider, providerSubject: 'idp-1', userId: 'user-a' },
        { provider: 'auth0:other', providerSubject: 'idp-1', userId: 'user-b' },
      ],
      sessions
    );

    expect(plan.userIds).toEqual(['user-a']);
    expect(plan.sessionIds).toEqual(['sess-1']);
  });

  it('honors explicit session ids even when no active session is found', () => {
    const plan = planBackChannelLogout(
      { provider: samlProvider, providerSubject: 'idp-1', sessionIds: ['custom-session'] },
      [{ provider: samlProvider, providerSubject: 'idp-1', userId: 'user-a' }],
      sessions
    );

    expect(plan.sessionIds).toContain('custom-session');
  });
});

describe('resolveSsoLoginUser', () => {
  it('links to existing identity match', () => {
    const result = resolveSsoLoginUser(identity(), [
      { provider: samlProvider, providerSubject: 'user-123', userId: 'user-a' },
    ]);
    expect(result).toEqual({ userId: 'user-a', action: 'link' });
  });

  it('links by verified email when allowed', () => {
    const result = resolveSsoLoginUser(
      identity(),
      [
        {
          provider: 'saml:other',
          providerSubject: 'other',
          userId: 'user-b',
          email: 'user@example.com',
        },
      ],
      { allowEmailLinking: true }
    );
    expect(result).toEqual({ userId: 'user-b', action: 'link' });
  });

  it('defaults to create when no link exists', () => {
    const result = resolveSsoLoginUser(identity(), []);
    expect(result.action).toBe('create');
    expect(result.userId).toBeNull();
  });
});
