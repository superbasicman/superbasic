import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.unmock('@repo/database');

import app from '../../../../app.js';
import { getTestPrisma, resetDatabase } from '../../../../test/setup.js';
import { createTestUser } from '../../../../test/helpers.js';
import { deriveCodeChallenge, generateCodeVerifier } from '@repo/auth-core';
import { issueAuthorizationCode } from '../../../../lib/oauth-authorization-codes.js';
import { authService } from '../../../../lib/auth-service.js';
import { createTokenHashEnvelope } from '@repo/auth';
import { randomUUID } from 'node:crypto';

function buildFormRequest(body: Record<string, string>): Request {
  const params = new URLSearchParams(body);
  return new Request('http://localhost/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
}

describe('POST /v1/oauth/token', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('Public Clients (unchanged behavior)', () => {
    it('exchanges a valid authorization code for tokens', async () => {
      const prisma = getTestPrisma();
      const { user } = await createTestUser();

      await prisma.oAuthClient.create({
        data: {
          clientId: 'mobile',
          name: 'Mobile',
          clientType: 'public',
          redirectUris: ['sb://callback'],
        },
      });

      const codeVerifier = generateCodeVerifier();
      const codeChallenge = deriveCodeChallenge(codeVerifier, 'S256');

      const { code } = await issueAuthorizationCode({
        userId: user.id,
        clientId: 'mobile',
        redirectUri: 'sb://callback',
        codeChallenge,
        codeChallengeMethod: 'S256',
        scopes: ['read:profile'],
      });

      const response = await app.fetch(
        buildFormRequest({
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'sb://callback',
          client_id: 'mobile',
          code_verifier: codeVerifier,
        })
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.token_type).toBe('Bearer');
      expect(typeof data.access_token).toBe('string');
      expect(typeof data.refresh_token).toBe('string');

      const session = await prisma.authSession.findFirst({ where: { userId: user.id } });
      expect((session?.clientInfo as any)?.type).toBe('mobile');
    });

    it('rotates refresh tokens via grant_type=refresh_token', async () => {
      const prisma = getTestPrisma();
      const { user } = await createTestUser();

      await prisma.oAuthClient.create({
        data: {
          clientId: 'web-dashboard',
          name: 'Web Dashboard',
          clientType: 'public',
          redirectUris: ['http://localhost:5173/auth/callback'],
        },
      });

      const familyId = randomUUID();
      const sessionWithRefresh = await authService.createSessionWithRefresh({
        userId: user.id,
        identity: {
          provider: 'local_password',
          providerSubject: user.id,
          email: user.primaryEmail,
        },
        clientType: 'web',
        workspaceId: null,
        rememberMe: true,
        refreshFamilyId: familyId,
      });

      const response = await app.fetch(
        buildFormRequest({
          grant_type: 'refresh_token',
          client_id: 'web-dashboard',
          refresh_token: sessionWithRefresh.refresh.refreshToken,
        })
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(typeof data.access_token).toBe('string');
      expect(typeof data.refresh_token).toBe('string');
      expect(data.refresh_token).not.toBe(sessionWithRefresh.refresh.refreshToken);

      const oldRecord = await prisma.refreshToken.findUnique({
        where: { id: sessionWithRefresh.refresh.token.id },
      });
      expect(oldRecord?.revokedAt).not.toBeNull();
    });
  });

  describe('Confidential Clients', () => {
    it('authorization_code grant succeeds with valid client_secret', async () => {
      const prisma = getTestPrisma();
      const { user } = await createTestUser();

      const clientSecret = 'test-secret-123';
      const hashEnvelope = createTokenHashEnvelope(clientSecret);

      // Create OAuth client FIRST (service_identity has FK to oauth_clients)
      await prisma.oAuthClient.create({
        data: {
          clientId: 'confidential-app',
          name: 'Confidential App',
          clientType: 'confidential',
          tokenEndpointAuthMethod: 'client_secret_post',
          redirectUris: ['https://app.example.com/callback'],
        },
      });

      // Then create service identity linked to OAuth client
      const serviceIdentity = await prisma.serviceIdentity.create({
        data: {
          name: 'Confidential Test App',
          serviceType: 'external',
          clientId: 'confidential-app',
        },
      });

      await prisma.clientSecret.create({
        data: {
          serviceIdentityId: serviceIdentity.id,
          secretHash: hashEnvelope,
        },
      });

      const codeVerifier = generateCodeVerifier();
      const codeChallenge = deriveCodeChallenge(codeVerifier, 'S256');

      const { code } = await issueAuthorizationCode({
        userId: user.id,
        clientId: 'confidential-app',
        redirectUri: 'https://app.example.com/callback',
        codeChallenge,
        codeChallengeMethod: 'S256',
      });

      const response = await app.fetch(
        buildFormRequest({
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'https://app.example.com/callback',
          client_id: 'confidential-app',
          code_verifier: codeVerifier,
          client_secret: clientSecret,
        })
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.token_type).toBe('Bearer');
      expect(typeof data.access_token).toBe('string');
    });

    it('authorization_code grant fails with invalid client_secret', async () => {
      const prisma = getTestPrisma();
      const { user } = await createTestUser();

      const hashEnvelope = createTokenHashEnvelope('correct-secret');

      // Create OAuth client FIRST (service_identity has FK to oauth_clients)
      await prisma.oAuthClient.create({
        data: {
          clientId: 'confidential-app',
          name: 'Confidential App',
          clientType: 'confidential',
          tokenEndpointAuthMethod: 'client_secret_post',
          redirectUris: ['https://app.example.com/callback'],
        },
      });

      // Then create service identity linked to OAuth client
      const serviceIdentity = await prisma.serviceIdentity.create({
        data: {
          name: 'Confidential Test App',
          serviceType: 'external',
          clientId: 'confidential-app',
        },
      });

      await prisma.clientSecret.create({
        data: {
          serviceIdentityId: serviceIdentity.id,
          secretHash: hashEnvelope,
        },
      });

      const codeVerifier = generateCodeVerifier();
      const codeChallenge = deriveCodeChallenge(codeVerifier, 'S256');

      const { code } = await issueAuthorizationCode({
        userId: user.id,
        clientId: 'confidential-app',
        redirectUri: 'https://app.example.com/callback',
        codeChallenge,
        codeChallengeMethod: 'S256',
      });

      const response = await app.fetch(
        buildFormRequest({
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'https://app.example.com/callback',
          client_id: 'confidential-app',
          code_verifier: codeVerifier,
          client_secret: 'wrong-secret',
        })
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('invalid_grant');
    });

    it('authorization_code grant fails when client_secret is missing', async () => {
      const prisma = getTestPrisma();
      const { user } = await createTestUser();

      const hashEnvelope = createTokenHashEnvelope('correct-secret');

      // Create OAuth client FIRST (service_identity has FK to oauth_clients)
      await prisma.oAuthClient.create({
        data: {
          clientId: 'confidential-app',
          name: 'Confidential App',
          clientType: 'confidential',
          tokenEndpointAuthMethod: 'client_secret_post',
          redirectUris: ['https://app.example.com/callback'],
        },
      });

      // Then create service identity linked to OAuth client
      const serviceIdentity = await prisma.serviceIdentity.create({
        data: {
          name: 'Confidential Test App',
          serviceType: 'external',
          clientId: 'confidential-app',
        },
      });

      await prisma.clientSecret.create({
        data: {
          serviceIdentityId: serviceIdentity.id,
          secretHash: hashEnvelope,
        },
      });

      const codeVerifier = generateCodeVerifier();
      const codeChallenge = deriveCodeChallenge(codeVerifier, 'S256');

      const { code } = await issueAuthorizationCode({
        userId: user.id,
        clientId: 'confidential-app',
        redirectUri: 'https://app.example.com/callback',
        codeChallenge,
        codeChallengeMethod: 'S256',
      });

      const response = await app.fetch(
        buildFormRequest({
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'https://app.example.com/callback',
          client_id: 'confidential-app',
          code_verifier: codeVerifier,
          // client_secret intentionally missing
        })
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('invalid_grant');
    });

    it('refresh_token grant succeeds with valid client_secret', async () => {
      const prisma = getTestPrisma();
      const { user } = await createTestUser();

      const clientSecret = 'test-secret-123';
      const hashEnvelope = createTokenHashEnvelope(clientSecret);

      // Create OAuth client FIRST (service_identity has FK to oauth_clients)
      await prisma.oAuthClient.create({
        data: {
          clientId: 'confidential-app',
          name: 'Confidential App',
          clientType: 'confidential',
          tokenEndpointAuthMethod: 'client_secret_post',
          redirectUris: ['https://app.example.com/callback'],
        },
      });

      // Then create service identity linked to OAuth client
      const serviceIdentity = await prisma.serviceIdentity.create({
        data: {
          name: 'Confidential Test App',
          serviceType: 'external',
          clientId: 'confidential-app',
        },
      });

      await prisma.clientSecret.create({
        data: {
          serviceIdentityId: serviceIdentity.id,
          secretHash: hashEnvelope,
        },
      });

      const sessionWithRefresh = await authService.createSessionWithRefresh({
        userId: user.id,
        identity: {
          provider: 'local_password',
          providerSubject: user.id,
          email: user.primaryEmail,
        },
        clientType: 'web',
        workspaceId: null,
        rememberMe: true,
      });

      const response = await app.fetch(
        buildFormRequest({
          grant_type: 'refresh_token',
          client_id: 'confidential-app',
          refresh_token: sessionWithRefresh.refresh.refreshToken,
          client_secret: clientSecret,
        })
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(typeof data.access_token).toBe('string');
      expect(typeof data.refresh_token).toBe('string');
    });

    it('refresh_token grant fails with invalid client_secret', async () => {
      const prisma = getTestPrisma();
      const { user } = await createTestUser();

      const hashEnvelope = createTokenHashEnvelope('correct-secret');

      // Create OAuth client FIRST (service_identity has FK to oauth_clients)
      await prisma.oAuthClient.create({
        data: {
          clientId: 'confidential-app',
          name: 'Confidential App',
          clientType: 'confidential',
          tokenEndpointAuthMethod: 'client_secret_post',
          redirectUris: ['https://app.example.com/callback'],
        },
      });

      // Then create service identity linked to OAuth client
      const serviceIdentity = await prisma.serviceIdentity.create({
        data: {
          name: 'Confidential Test App',
          serviceType: 'external',
          clientId: 'confidential-app',
        },
      });

      await prisma.clientSecret.create({
        data: {
          serviceIdentityId: serviceIdentity.id,
          secretHash: hashEnvelope,
        },
      });

      const sessionWithRefresh = await authService.createSessionWithRefresh({
        userId: user.id,
        identity: {
          provider: 'local_password',
          providerSubject: user.id,
          email: user.primaryEmail,
        },
        clientType: 'web',
        workspaceId: null,
        rememberMe: true,
      });

      const response = await app.fetch(
        buildFormRequest({
          grant_type: 'refresh_token',
          client_id: 'confidential-app',
          refresh_token: sessionWithRefresh.refresh.refreshToken,
          client_secret: 'wrong-secret',
        })
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('invalid_grant');
    });
  });
});
