import type { ApiKey } from '@repo/database';
import { prisma, Prisma } from '@repo/database';
import { authEvents, validateScopes } from '@repo/auth';
import {
  DuplicateTokenNameError,
  InvalidExpirationError,
  InvalidScopesError,
  TokenNotFoundError,
} from '@repo/core';
import type { PermissionScope } from '@repo/auth-core';
import { authService } from './auth-service.js';

type RequestContext = {
  ip?: string;
  userAgent?: string;
  requestId?: string;
};

const MIN_EXPIRATION_DAYS = 1;
const MAX_EXPIRATION_DAYS = 365;
const DEFAULT_EXPIRATION_DAYS = 90;

export async function issuePersonalAccessToken(options: {
  userId: string;
  profileId: string;
  name: string;
  scopes: PermissionScope[];
  expiresInDays?: number;
  requestContext?: RequestContext;
}) {
  validateCreateParams(options.scopes, options.expiresInDays);

  await assertNameIsUnique({
    userId: options.userId,
    name: options.name,
  });

  const expiresAt = calculateExpiresAt(options.expiresInDays);
  const issued = await authService.issuePersonalAccessToken({
    userId: options.userId,
    scopes: options.scopes,
    name: options.name,
    expiresAt,
  });

  const last4 = issued.secret.slice(-4);
  await prisma.apiKey.update({
    where: { id: issued.tokenId },
    data: {
      metadata: mergeMetadata({ last4 }),
    },
  });

  await authEvents.emit({
    type: 'token.created',
    userId: options.userId,
    metadata: {
      tokenId: issued.tokenId,
      profileId: options.profileId,
      tokenName: options.name,
      scopes: options.scopes,
      expiresAt: expiresAt?.toISOString() ?? null,
      ip: options.requestContext?.ip ?? 'unknown',
      userAgent: options.requestContext?.userAgent ?? 'unknown',
      requestId: options.requestContext?.requestId ?? 'unknown',
      timestamp: new Date().toISOString(),
    },
  });

  const created = await prisma.apiKey.findUniqueOrThrow({
    where: { id: issued.tokenId },
  });

  return mapToken(created, issued.secret, last4);
}

export async function listPersonalAccessTokens(userId: string) {
  const tokens = await prisma.apiKey.findMany({
    where: {
      userId,
      revokedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });

  return tokens.map((token) => mapToken(token));
}

export async function renamePersonalAccessToken(options: {
  tokenId: string;
  userId: string;
  name: string;
  requestContext?: RequestContext;
}) {
  const token = await prisma.apiKey.findUnique({
    where: { id: options.tokenId },
  });

  if (!isOwnedActivePat(token, options.userId)) {
    throw new TokenNotFoundError(options.tokenId);
  }

  await assertNameIsUnique({
    userId: options.userId,
    name: options.name,
    excludeId: options.tokenId,
  });

  const updated = await prisma.apiKey.update({
    where: { id: options.tokenId },
    data: { name: options.name },
  });

  await authEvents.emit({
    type: 'token.updated',
    userId: options.userId,
    metadata: {
      tokenId: options.tokenId,
      previousName: token?.name ?? '',
      newName: options.name,
      ip: options.requestContext?.ip ?? 'unknown',
      userAgent: options.requestContext?.userAgent ?? 'unknown',
      requestId: options.requestContext?.requestId ?? null,
      timestamp: new Date().toISOString(),
    },
  });

  return mapToken(updated);
}

export async function revokePersonalAccessToken(options: {
  tokenId: string;
  userId: string;
  requestContext?: RequestContext;
}) {
  const token = await prisma.apiKey.findUnique({
    where: { id: options.tokenId },
    select: { id: true, userId: true, revokedAt: true },
  });

  if (!token || token.userId !== options.userId) {
    throw new TokenNotFoundError(options.tokenId);
  }

  if (!token.revokedAt) {
    await authService.revokeToken({
      tokenId: options.tokenId,
      revokedBy: options.userId,
      reason: 'user_revoke',
    });

    await authEvents.emit({
      type: 'token.revoked',
      userId: options.userId,
      metadata: {
        tokenId: options.tokenId,
        ip: options.requestContext?.ip ?? 'unknown',
        userAgent: options.requestContext?.userAgent ?? 'unknown',
        requestId: options.requestContext?.requestId ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
  }
}

function validateCreateParams(scopes: PermissionScope[], expiresInDays?: number) {
  if (!validateScopes(scopes)) {
    throw new InvalidScopesError(scopes);
  }

  const days = expiresInDays ?? DEFAULT_EXPIRATION_DAYS;
  if (days < MIN_EXPIRATION_DAYS || days > MAX_EXPIRATION_DAYS) {
    throw new InvalidExpirationError(days);
  }
}

async function assertNameIsUnique(options: { userId: string; name: string; excludeId?: string }) {
  const existing = await prisma.apiKey.findFirst({
    where: {
      userId: options.userId,
      name: options.name,
      revokedAt: null,
      ...(options.excludeId ? { NOT: { id: options.excludeId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new DuplicateTokenNameError(options.name);
  }
}

function calculateExpiresAt(expiresInDays?: number | null) {
  const days = expiresInDays ?? DEFAULT_EXPIRATION_DAYS;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

function mapToken(record: ApiKey, secret?: string, last4Override?: string) {
  const last4 = last4Override ?? record.last4 ?? null;
  const maskedToken = `sbf_****${(last4 as string | null) ?? '????'}`;

  const base = {
    id: record.id,
    name: record.name ?? '',
    scopes: record.scopes,
    workspaceId: record.workspaceId ?? null,
    createdAt: record.createdAt.toISOString(),
    lastUsedAt: record.lastUsedAt ? record.lastUsedAt.toISOString() : null,
    expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
    maskedToken,
  };

  if (secret) {
    return { ...base, token: secret };
  }

  return base;
}

function mergeMetadata(additions: Record<string, unknown>): Prisma.InputJsonValue {
  return additions as Prisma.InputJsonValue;
}

function isOwnedActivePat(token: ApiKey | null, userId: string) {
  return token && token.userId === userId && token.revokedAt === null;
}
