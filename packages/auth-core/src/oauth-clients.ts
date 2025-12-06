import type { PrismaClient } from '@repo/database';
import { AuthorizationError } from './errors.js';
import type { OAuthClientRecord } from './types.js';

function mapClient(record: {
  id: string;
  clientId: string;
  clientType: 'public' | 'confidential';
  redirectUris: string[];
  tokenEndpointAuthMethod:
    | 'none'
    | 'client_secret_basic'
    | 'client_secret_post'
    | 'private_key_jwt';
  isFirstParty: boolean;
  disabledAt: Date | null;
}): OAuthClientRecord {
  return {
    id: record.id,
    clientId: record.clientId,
    type: record.clientType, // Map clientType -> type per goal spec
    redirectUris: record.redirectUris,
    tokenEndpointAuthMethod: record.tokenEndpointAuthMethod,
    isFirstParty: record.isFirstParty,
    disabledAt: record.disabledAt,
  };
}

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
  prisma: Pick<PrismaClient, 'oAuthClient'>,
  clientId: string
): Promise<OAuthClientRecord | null> {
  const record = await prisma.oAuthClient.findUnique({
    where: { clientId },
    select: {
      id: true,
      clientId: true,
      clientType: true,
      redirectUris: true,
      tokenEndpointAuthMethod: true,
      isFirstParty: true,
      disabledAt: true,
    },
  });
  return record ? mapClient(record) : null;
}

/**
 * Check if an OAuth client is a first-party client.
 * First-party clients can receive user profile data in token responses.
 */
export async function isFirstPartyClient(
  prisma: Pick<PrismaClient, 'oAuthClient'>,
  clientId: string
): Promise<boolean> {
  const client = await prisma.oAuthClient.findUnique({
    where: { clientId },
    select: { isFirstParty: true },
  });
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
  prisma: Pick<PrismaClient, 'oAuthClient'>;
  clientId: string;
  redirectUri?: string | null;
  allowDisabled?: boolean;
}): Promise<OAuthClientRecord> {
  const client = await findOAuthClient(params.prisma, params.clientId);
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
