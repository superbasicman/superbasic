import { randomUUID } from 'node:crypto';
import { createOpaqueToken, createTokenHashEnvelope } from '@repo/auth';
import { type PrismaClient, type Token as PrismaToken, prisma } from '@repo/database';
import { toJsonInput } from './json.js';
import type { RefreshTokenRecord, TokenHashEnvelope } from './types.js';

export type IssueRefreshTokenInput = {
  userId: string;
  sessionId: string;
  expiresAt: Date;
  familyId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type IssueRefreshTokenResult = {
  refreshToken: string;
  token: RefreshTokenRecord;
};

type TokenServiceDependencies = {
  prisma?: PrismaClient;
  createOpaqueToken?: typeof createOpaqueToken;
  createTokenHashEnvelope?: typeof createTokenHashEnvelope;
  familyIdFactory?: () => string;
};

export class TokenService {
  private readonly prisma: PrismaClient;
  private readonly tokenFactory: typeof createOpaqueToken;
  private readonly hashFactory: typeof createTokenHashEnvelope;
  private readonly familyIdFactory: () => string;

  constructor(dependencies: TokenServiceDependencies = {}) {
    this.prisma = dependencies.prisma ?? prisma;
    this.tokenFactory = dependencies.createOpaqueToken ?? createOpaqueToken;
    this.hashFactory = dependencies.createTokenHashEnvelope ?? createTokenHashEnvelope;
    this.familyIdFactory = dependencies.familyIdFactory ?? randomUUID;
  }

  async issueRefreshToken(input: IssueRefreshTokenInput): Promise<IssueRefreshTokenResult> {
    if (!isValidDate(input.expiresAt)) {
      throw new Error('expiresAt must be a valid Date instance');
    }

    const familyId = input.familyId ?? this.familyIdFactory();
    const opaque = this.tokenFactory();
    const tokenHash = this.hashFactory(opaque.tokenSecret);

    const refreshMetadata = input.metadata !== undefined ? toJsonInput(input.metadata) : undefined;

    const created = await this.prisma.token.create({
      data: {
        id: opaque.tokenId,
        userId: input.userId,
        sessionId: input.sessionId,
        workspaceId: null,
        type: 'refresh',
        tokenHash,
        scopes: [],
        name: null,
        familyId,
        ...(refreshMetadata !== undefined ? { metadata: refreshMetadata } : {}),
        lastUsedAt: null,
        expiresAt: input.expiresAt,
        revokedAt: null,
      },
    });

    return {
      refreshToken: opaque.value,
      token: mapRefreshToken(created),
    };
  }
}

function mapRefreshToken(record: PrismaToken): RefreshTokenRecord {
  if (record.type !== 'refresh') {
    throw new Error(`Token ${record.id} is not a refresh token`);
  }

  if (!record.sessionId) {
    throw new Error(`Refresh token ${record.id} is missing sessionId`);
  }

  if (!record.familyId) {
    throw new Error(`Refresh token ${record.id} is missing familyId`);
  }

  if (!record.expiresAt) {
    throw new Error(`Refresh token ${record.id} is missing expiresAt`);
  }

  return {
    id: record.id,
    userId: record.userId,
    sessionId: record.sessionId,
    workspaceId: record.workspaceId,
    type: 'refresh',
    tokenHash: record.tokenHash as TokenHashEnvelope,
    scopes: record.scopes,
    name: record.name,
    familyId: record.familyId,
    metadata: (record.metadata as Record<string, unknown> | null) ?? null,
    lastUsedAt: record.lastUsedAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.valueOf());
}
