import { isWorkspaceRole } from './authz.js';
import { AuthorizationError } from './errors.js';
import type {
  SessionSummary,
  SsoLoginResolution,
  SsoLogoutEvent,
  SsoLogoutPlan,
  VerifiedIdentity,
  WorkspaceRole,
  WorkspaceSsoBinding,
} from './types.js';

const SUPPORTED_SSO_PREFIXES = ['saml:', 'oidc:', 'auth0:'];

function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }
  const atIndex = email.indexOf('@');
  if (atIndex === -1) {
    return null;
  }
  const domain = email
    .slice(atIndex + 1)
    .trim()
    .toLowerCase();
  return domain || null;
}

export function isSsoProvider(provider: string): boolean {
  const normalized = provider.trim().toLowerCase();
  return SUPPORTED_SSO_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function normalizeSsoProvider(provider: string): string {
  const normalized = provider.trim();
  if (!isSsoProvider(normalized)) {
    throw new AuthorizationError('Unsupported SSO provider');
  }

  const [, suffix] = normalized.split(':');
  if (!suffix?.trim()) {
    throw new AuthorizationError('SSO provider identifier is missing');
  }

  return normalized;
}

function validateBinding(binding: WorkspaceSsoBinding) {
  normalizeSsoProvider(binding.provider);

  if (binding.defaultRole && !isWorkspaceRole(binding.defaultRole)) {
    throw new AuthorizationError('SSO binding default role is invalid');
  }
}

function ensureDomainAllowed(binding: WorkspaceSsoBinding, identity: VerifiedIdentity) {
  if (!binding.allowedEmailDomains || binding.allowedEmailDomains.length === 0) {
    return;
  }

  if (!identity.emailVerified) {
    throw new AuthorizationError('Email must be verified for this SSO connection');
  }

  const domain = extractEmailDomain(identity.email);
  if (!domain) {
    throw new AuthorizationError('Email domain is required for this SSO connection');
  }

  const allowed = binding.allowedEmailDomains.map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(domain)) {
    throw new AuthorizationError('Email domain is not allowed for this SSO connection');
  }
}

export function resolveSsoWorkspace(
  identity: VerifiedIdentity,
  bindings: WorkspaceSsoBinding[]
): {
  workspaceId: string;
  provider: string;
  mode: WorkspaceSsoBinding['mode'];
  defaultRole: WorkspaceRole | null;
} | null {
  const provider = normalizeSsoProvider(identity.provider);
  const map = new Map<string, WorkspaceSsoBinding>();

  for (const binding of bindings) {
    validateBinding(binding);
    const normalized = normalizeSsoProvider(binding.provider);
    if (map.has(normalized)) {
      throw new AuthorizationError('Duplicate SSO provider binding detected');
    }
    map.set(normalized, binding);
  }

  const binding = map.get(provider);
  if (!binding) {
    return null;
  }

  ensureDomainAllowed(binding, identity);

  return {
    workspaceId: binding.workspaceId,
    provider,
    mode: binding.mode,
    defaultRole: binding.defaultRole ?? null,
  };
}

export function planBackChannelLogout(
  event: SsoLogoutEvent,
  identities: { provider: string; providerUserId: string; userId: string }[],
  sessions: SessionSummary[] = []
): SsoLogoutPlan {
  const provider = normalizeSsoProvider(event.provider);
  const userIds = new Set<string>();
  const sessionIds = new Set<string>();

  for (const identity of identities) {
    if (
      normalizeSsoProvider(identity.provider) === provider &&
      identity.providerUserId === event.providerUserId
    ) {
      userIds.add(identity.userId);
    }
  }

  if (event.sessionIds) {
    for (const id of event.sessionIds) {
      const trimmed = id.trim();
      if (trimmed) {
        sessionIds.add(trimmed);
      }
    }
  }

  for (const session of sessions) {
    if (userIds.has(session.userId) && !session.revokedAt) {
      sessionIds.add(session.id);
    }
  }

  return {
    userIds: [...userIds],
    sessionIds: [...sessionIds],
  };
}

export function resolveSsoLoginUser(
  identity: VerifiedIdentity,
  identities: { provider: string; providerUserId: string; userId: string; email?: string | null }[],
  options: { allowEmailLinking?: boolean } = {}
): SsoLoginResolution {
  const provider = normalizeSsoProvider(identity.provider);
  const directMatch = identities.find(
    (existing) =>
      normalizeSsoProvider(existing.provider) === provider &&
      existing.providerUserId === identity.providerUserId
  );

  if (directMatch) {
    return { userId: directMatch.userId, action: 'link' };
  }

  if (options.allowEmailLinking && identity.email && identity.emailVerified) {
    const normalizedEmail = identity.email.trim().toLowerCase();
    const emailMatch = identities.find((existing) => {
      const existingEmail = existing.email?.trim().toLowerCase() ?? null;
      return existingEmail === normalizedEmail;
    });
    if (emailMatch) {
      return { userId: emailMatch.userId, action: 'link' };
    }
  }

  return { userId: null, action: 'create', reason: 'no_existing_link' };
}
