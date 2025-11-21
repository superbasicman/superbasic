import { createOpaqueToken, createTokenHashEnvelope, verifyTokenSecret } from '@repo/auth';
import type { OAuthAuthorizationCode as PrismaAuthorizationCode, PrismaClient } from '@repo/database';
import { prisma } from '@repo/database';
import { AuthorizationError } from '@repo/auth-core';
import type { PermissionScope, PkceChallengeMethod, TokenHashEnvelope } from '@repo/auth-core';

const DEFAULT_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type IssueAuthorizationCodeInput = {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: PkceChallengeMethod;
  scopes?: PermissionScope[];
  expiresInMs?: number;
};

export type AuthorizationCodeRecord = {
  id: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  codeHash: TokenHashEnvelope;
  codeChallenge: string;
  codeChallengeMethod: PkceChallengeMethod;
  scopes: PermissionScope[];
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

function mapAuthorizationCode(record: PrismaAuthorizationCode): AuthorizationCodeRecord {
  return {
    id: record.id,
    userId: record.userId,
    clientId: record.clientId,
    redirectUri: record.redirectUri,
    codeHash: record.codeHash as TokenHashEnvelope,
    codeChallenge: record.codeChallenge,
    codeChallengeMethod: record.codeChallengeMethod as PkceChallengeMethod,
    scopes: record.scopes as PermissionScope[],
    expiresAt: record.expiresAt,
    consumedAt: record.consumedAt ?? null,
    createdAt: record.createdAt,
  };
}

export async function issueAuthorizationCode(
  input: IssueAuthorizationCodeInput,
  db: PrismaClient = prisma
): Promise<{ code: string; record: AuthorizationCodeRecord }> {
  const expiresInMs = input.expiresInMs ?? DEFAULT_CODE_TTL_MS;
  const expiresAt = new Date(Date.now() + expiresInMs);
  const opaque = createOpaqueToken();
  const codeHash = createTokenHashEnvelope(opaque.tokenSecret);
  const scopes = dedupeScopes(input.scopes ?? []);

  const record = await db.oAuthAuthorizationCode.create({
    data: {
      id: opaque.tokenId,
      userId: input.userId,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      codeHash,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      scopes,
      expiresAt,
      consumedAt: null,
    },
  });

  return { code: opaque.value, record: mapAuthorizationCode(record) };
}

function dedupeScopes(scopes: PermissionScope[]): PermissionScope[] {
  return Array.from(new Set(scopes.filter(Boolean))) as PermissionScope[];
}

export const AUTHORIZATION_CODE_TTL_MS = DEFAULT_CODE_TTL_MS;

export async function consumeAuthorizationCode(params: {
  codeId: string;
  codeSecret: string;
  prismaClient?: PrismaClient;
}): Promise<AuthorizationCodeRecord> {
  const db = params.prismaClient ?? prisma;
  const now = new Date();

  return db.$transaction(async (tx) => {
    const record = await tx.oAuthAuthorizationCode.findFirst({
      where: { id: params.codeId, consumedAt: null, expiresAt: { gt: now } },
    });

    if (!record) {
      throw new AuthorizationError('Invalid or expired authorization code');
    }

    if (!verifyTokenSecret(params.codeSecret, record.codeHash as unknown as TokenHashEnvelope)) {
      throw new AuthorizationError('Invalid or expired authorization code');
    }

    await tx.oAuthAuthorizationCode.delete({ where: { id: record.id } });

    return mapAuthorizationCode(record);
  });
}
