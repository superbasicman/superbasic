import { AuthorizationError } from './errors.js';
import type { OAuthClientRepository } from './interfaces.js';
import type { OAuthClientRecord } from './types.js';

export function normalizeRedirectUri(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') {
    throw new AuthorizationError('redirect_uri is required');
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new AuthorizationError('redirect_uri is required');
  }
  return normalized;
}

export async function findOAuthClient(
  repo: OAuthClientRepository,
  clientId: string
): Promise<OAuthClientRecord | null> {
  return repo.findByClientId(clientId);
}

/**
 * Check if an OAuth client is a first-party client.
 * First-party clients can receive user profile data in token responses.
 */
export async function isFirstPartyClient(
  repo: OAuthClientRepository,
  clientId: string
): Promise<boolean> {
  const client = await repo.findByClientId(clientId);
  return client?.isFirstParty ?? false;
}

export function validateRedirectUri(client: OAuthClientRecord, redirectUri: string): string {
  const normalized = normalizeRedirectUri(redirectUri);
  const allowed = client.redirectUris.map(normalizeRedirectUri);
  if (allowed.length === 0) {
    throw new AuthorizationError('OAuth client has no redirect URIs configured');
  }

  if (!allowed.includes(normalized)) {
    throw new AuthorizationError('redirect_uri is not allowed for this client');
  }

  return normalized;
}

export async function requireOAuthClient(params: {
  repo: OAuthClientRepository;
  clientId: string;
  redirectUri?: string | null;
  allowDisabled?: boolean;
}): Promise<OAuthClientRecord> {
  const client = await findOAuthClient(params.repo, params.clientId);
  if (!client) {
    throw new AuthorizationError('Invalid client_id');
  }

  if (client.disabledAt && !params.allowDisabled) {
    throw new AuthorizationError('OAuth client is disabled');
  }

  if (params.redirectUri) {
    validateRedirectUri(client, params.redirectUri);
  }

  return client;
}
