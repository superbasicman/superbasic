import { verifyTokenSecret } from '@repo/auth';
import type { TokenHashEnvelope } from '@repo/auth';
import type { PrismaClient } from '@repo/database';
import { AuthorizationError } from './errors.js';
import type { OAuthClientRecord } from './types.js';

/**
 * Extract client_secret from request
 * Supports both client_secret_post (form body) and client_secret_basic (Authorization header)
 */
export function extractClientSecret(
  authHeader: string | undefined,
  bodySecret: string | undefined
): string | null {
  // Try Basic auth header first (client_secret_basic)
  if (authHeader?.startsWith('Basic ')) {
    const base64 = authHeader.slice(6);
    try {
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      const [, secret] = decoded.split(':', 2);
      if (secret) {
        return secret;
      }
    } catch {
      // Invalid base64, continue to form body
    }
  }

  // Fall back to form body (client_secret_post)
  return bodySecret ?? null;
}

/**
 * Authenticate a confidential OAuth client by verifying its client_secret
 * Throws AuthorizationError if authentication fails
 */
export async function authenticateConfidentialClient(params: {
  prisma: Pick<PrismaClient, 'serviceIdentity'>;
  client: OAuthClientRecord;
  clientSecret: string | null;
}): Promise<void> {
  const { prisma, client, clientSecret } = params;

  // Only confidential clients require authentication
  if (client.type !== 'confidential') {
    return;
  }

  if (!clientSecret) {
    throw new AuthorizationError('client_secret is required for confidential clients');
  }

  // Look up the service identity linked to this OAuth client
  const serviceIdentity = await prisma.serviceIdentity.findUnique({
    where: { clientId: client.clientId },
    include: {
      clientSecrets: {
        where: {
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!serviceIdentity || serviceIdentity.disabledAt) {
    throw new AuthorizationError('Invalid client credentials');
  }

  const [clientSecretRecord] = serviceIdentity.clientSecrets;
  if (!clientSecretRecord) {
    throw new AuthorizationError('Invalid client credentials');
  }

  const hashEnvelope = clientSecretRecord.secretHash as TokenHashEnvelope | null;
  if (!hashEnvelope || !verifyTokenSecret(clientSecret, hashEnvelope)) {
    throw new AuthorizationError('Invalid client credentials');
  }
}
