import { AuthorizationError } from './errors.js';
import type { OAuthClientRepository } from './interfaces.js';
import { verifyTokenSecret } from './token-hash.js';
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
  repo: OAuthClientRepository;
  client: OAuthClientRecord;
  clientSecret: string | null;
}): Promise<void> {
  const { repo, client, clientSecret } = params;

  // Only confidential clients require authentication
  if (client.type !== 'confidential') {
    return;
  }

  if (!clientSecret) {
    throw new AuthorizationError('client_secret is required for confidential clients');
  }

  const hashEnvelope = await repo.findClientSecret(client.clientId);
  if (!hashEnvelope) {
    throw new AuthorizationError('Invalid client credentials');
  }

  if (!verifyTokenSecret(clientSecret, hashEnvelope)) {
    throw new AuthorizationError('Invalid client credentials');
  }
}
