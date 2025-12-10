import { randomUUID } from 'node:crypto';
import { createOpaqueToken, createTokenHashEnvelope } from '@repo/auth';
import type { RefreshTokenRepository } from './interfaces.js';
import type { IssueRefreshTokenInput, IssueRefreshTokenResult } from './types.js';

type TokenServiceDependencies = {
  repo: RefreshTokenRepository;
  createOpaqueToken?: typeof createOpaqueToken;
  createTokenHashEnvelope?: typeof createTokenHashEnvelope;
  familyIdFactory?: () => string;
};

export class TokenService {
  private readonly repo: RefreshTokenRepository;
  private readonly tokenFactory: typeof createOpaqueToken;
  private readonly hashFactory: typeof createTokenHashEnvelope;
  private readonly familyIdFactory: () => string;

  constructor(dependencies: TokenServiceDependencies) {
    this.repo = dependencies.repo;
    this.tokenFactory = dependencies.createOpaqueToken ?? createOpaqueToken;
    this.hashFactory = dependencies.createTokenHashEnvelope ?? createTokenHashEnvelope;
    this.familyIdFactory = dependencies.familyIdFactory ?? randomUUID;
  }

  async issueRefreshToken(input: IssueRefreshTokenInput): Promise<IssueRefreshTokenResult> {
    if (!isValidDate(input.expiresAt)) {
      throw new Error('expiresAt must be a valid Date instance');
    }

    const familyId = input.familyId ?? this.familyIdFactory();
    const opaque = this.tokenFactory({ prefix: 'rt' });
    const tokenHash = this.hashFactory(opaque.tokenSecret);

    const created = await this.repo.create({
      id: opaque.tokenId,
      userId: input.userId,
      sessionId: input.sessionId,
      hashEnvelope: tokenHash,
      scopes: input.scopes ?? [],
      familyId,
      last4: opaque.value.slice(-4),
      expiresAt: input.expiresAt,
    });

    return {
      refreshToken: opaque.value,
      token: created,
    };
  }
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.valueOf());
}
