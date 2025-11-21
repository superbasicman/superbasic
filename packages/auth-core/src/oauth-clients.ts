import type { PrismaClient } from '@repo/database';
import { AuthorizationError } from './errors.js';
import type { OAuthClientRecord } from './types.js';

function mapClient(record: {
  id: string;
  clientId: string;
  type: 'public' | 'confidential';
  redirectUris: string[];
  disabledAt: Date | null;
}): OAuthClientRecord {
  return {
    id: record.id,
    clientId: record.clientId,
    type: record.type,
    redirectUris: record.redirectUris,
    disabledAt: record.disabledAt,
  };
}

export async function findOAuthClient(
  prisma: Pick<PrismaClient, 'oAuthClient'>,
  clientId: string
): Promise<OAuthClientRecord | null> {
  const record = await prisma.oAuthClient.findUnique({
    where: { clientId },
  });
  return record ? mapClient(record) : null;
}

export function validateRedirectUri(client: OAuthClientRecord, redirectUri: string): string {
  const normalized = redirectUri.trim();
  if (!normalized) {
    throw new AuthorizationError('redirect_uri is required');
  }

  const allowed = client.redirectUris.map((uri) => uri.trim()).filter(Boolean);
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
