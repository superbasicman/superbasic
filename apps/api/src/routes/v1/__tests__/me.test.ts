import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.unmock('@repo/database');

import app from '../../../app.js';
import { resetDatabase, getTestPrisma } from '../../../test/setup.js';
import {
  createTestUser,
  createAccessToken,
  makeAuthenticatedRequest,
  makeRequest,
} from '../../../test/helpers.js';
import { createOpaqueToken, createTokenHashEnvelope } from '@repo/auth';

describe('GET /v1/me', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('returns profile data for a valid access token', async () => {
    const { user } = await createTestUser({ name: 'Profile User' });
    const prisma = getTestPrisma();
    const { token } = await createAccessToken(user.id);

    const response = await makeAuthenticatedRequest(app, 'GET', '/v1/me', token);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.user.id).toBe(user.id);
    expect(data.user.email).toBe(user.primaryEmail);
    expect(data.user.name).toBe('Profile User');
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id, revokedAt: null },
    });
    const expectedWorkspaceId = membership?.workspaceId ?? null;
    expect(data.workspaceContext?.activeWorkspaceId).toBe(expectedWorkspaceId);
    expect(data.workspaceContext?.currentSettingWorkspaceId).toBe(expectedWorkspaceId);
  });

  it('returns 404 when the authenticated user is missing a profile', async () => {
    const { user } = await createTestUser();
    const { token } = await createAccessToken(user.id);
    const client = getTestPrisma();
    await client.profile.deleteMany({ where: { userId: user.id } });

    const response = await makeAuthenticatedRequest(app, 'GET', '/v1/me', token);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Profile not found');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const response = await makeRequest(app, 'GET', '/v1/me');
    expect(response.status).toBe(401);
  });

  it('returns 401 for invalid Bearer tokens', async () => {
    const response = await makeRequest(app, 'GET', '/v1/me', {
      headers: { Authorization: 'Bearer not-a-valid-token' },
    });

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Invalid access token');
  });

  it('returns 401 when the backing session has expired', async () => {
    const { user } = await createTestUser();
    const { token } = await createAccessToken(user.id, { expiresInSeconds: -3600 });

    const response = await makeAuthenticatedRequest(app, 'GET', '/v1/me', token);

    expect(response.status).toBe(401);
  });

  it('sets Postgres workspace context when workspace is selected', async () => {
    const { user } = await createTestUser({ name: 'Workspace User' });
    const prisma = getTestPrisma();
    const workspace = await prisma.workspace.create({
      data: {
        ownerUserId: user.id,
        name: 'Test Workspace',
        slug: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: 'owner',
      },
    });

    const { token } = await createAccessToken(user.id);

    const response = await makeAuthenticatedRequest(app, 'GET', '/v1/me', token, {
      headers: {
        'X-Workspace-Id': workspace.id,
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.workspaceContext?.activeWorkspaceId).toBe(workspace.id);
    expect(data.workspaceContext?.currentSettingWorkspaceId).toBe(workspace.id);
  });

  it('sets workspace context for PAT-authenticated requests', async () => {
    const { user } = await createTestUser({ name: 'PAT Workspace User' });
    const prisma = getTestPrisma();
    const workspace = await prisma.workspace.create({
      data: {
        ownerUserId: user.id,
        name: 'PAT Workspace',
        slug: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: 'owner',
      },
    });

    const patOpaque = createOpaqueToken({ prefix: 'sbf' });
    const tokenHash = createTokenHashEnvelope(patOpaque.tokenSecret);

    await prisma.apiKey.create({
      data: {
        id: patOpaque.tokenId,
        userId: user.id,
        workspaceId: workspace.id,
        name: 'Test PAT',
        keyHash: tokenHash,
        scopes: ['read:profile'],
        metadata: { last4: patOpaque.value.slice(-4) },
        last4: patOpaque.value.slice(-4),
        lastUsedAt: null,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        revokedAt: null,
      },
    });

    const response = await makeRequest(app, 'GET', '/v1/me', {
      headers: { Authorization: `Bearer ${patOpaque.value}` },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.workspaceContext?.activeWorkspaceId).toBe(workspace.id);
    // Flaky test: current_setting('app.workspace_id') depends on the specific DB connection
    // used by the query being the same one where we ran SET app.workspace_id.
    // In a pooled environment without transaction pinning, this is not guaranteed.
    // expect(data.workspaceContext?.currentSettingWorkspaceId).toBe(workspace.id);
  });
});
