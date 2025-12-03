import { randomUUID } from 'node:crypto';
import { createOpaqueToken, createTokenHashEnvelope } from '@repo/auth';
import { type PrismaClient, type RefreshToken as PrismaRefreshToken, prisma } from '@repo/database';
import type {
  IssueRefreshTokenInput,
  IssueRefreshTokenResult,
  RefreshTokenRecord,
  TokenHashEnvelope,
} from './types.js';

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

    // const refreshMetadata = input.metadata !== undefined ? toJsonInput(input.metadata) : undefined;

    const created = await this.prisma.refreshToken.create({
      data: {
        id: opaque.tokenId,
        userId: input.userId,
        sessionId: input.sessionId,
        // workspaceId: null, // Not in RefreshToken
        // type: 'refresh', // Not in RefreshToken
        hashEnvelope: tokenHash, // Mapped from tokenHash
        // scopes: [], // Not in RefreshToken
        // name: null, // Not in RefreshToken
        familyId,
        // ...(refreshMetadata !== undefined ? { metadata: refreshMetadata } : {}), // Not in RefreshToken
        last4: opaque.value.slice(-4),
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

function mapRefreshToken(record: PrismaRefreshToken): RefreshTokenRecord {
  // if (record.type !== 'refresh') {
  //   throw new Error(`Token ${record.id} is not a refresh token`);
  // }

  if (!record.sessionId) {
    throw new Error(`Refresh token ${record.id} is missing sessionId`);
  }

  if (!record.expiresAt) {
    throw new Error(`Refresh token ${record.id} is missing expiresAt`);
  }

  return {
    id: record.id,
    userId: record.userId,
    sessionId: record.sessionId,
    workspaceId: null, // record.workspaceId,
    type: 'refresh',
    tokenHash: record.hashEnvelope as TokenHashEnvelope,
    scopes: [], // record.scopes as PermissionScope[],
    name: null, // record.name,
    familyId: record.familyId ?? null,
    metadata: null, // (record.metadata as Record<string, unknown> | null) ?? null,
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
