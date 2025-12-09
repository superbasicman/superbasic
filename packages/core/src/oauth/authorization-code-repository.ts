import type { PrismaClient, PrismaClientOrTransaction } from '@repo/database';
import type { PermissionScope, PkceChallengeMethod, TokenHashEnvelope } from '@repo/auth-core';

export type AuthorizationCodeEntity = {
  id: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  codeHash: TokenHashEnvelope;
  codeChallenge: string;
  codeChallengeMethod: PkceChallengeMethod;
  scopes: PermissionScope[];
  nonce: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

export type CreateAuthorizationCodeParams = {
  id: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  codeHash: TokenHashEnvelope;
  codeChallenge: string;
  codeChallengeMethod: PkceChallengeMethod;
  scopes: PermissionScope[];
  nonce: string | null;
  expiresAt: Date;
};

export class AuthorizationCodeRepository {
  constructor(private prisma: PrismaClient) {}

  private getClient(client?: PrismaClientOrTransaction): PrismaClientOrTransaction {
    return client ?? this.prisma;
  }

  async create(
    params: CreateAuthorizationCodeParams,
    client?: PrismaClientOrTransaction
  ): Promise<AuthorizationCodeEntity> {
    const db = this.getClient(client);
    const record = await db.oAuthAuthorizationCode.create({
      data: {
        id: params.id,
        userId: params.userId,
        clientId: params.clientId,
        redirectUri: params.redirectUri,
        codeHash: params.codeHash,
        codeChallenge: params.codeChallenge,
        codeChallengeMethod: params.codeChallengeMethod,
        scopes: params.scopes,
        nonce: params.nonce,
        expiresAt: params.expiresAt,
        consumedAt: null,
      },
    });

    return mapRecord(record);
  }

  async consume(
    params: { id: string; validate: (record: AuthorizationCodeEntity) => boolean },
    client?: PrismaClientOrTransaction
  ): Promise<AuthorizationCodeEntity | null> {
    const db = this.getClient(client);
    const now = new Date();

    const runInTransaction = async (
      action: (tx: PrismaClientOrTransaction) => Promise<AuthorizationCodeEntity | null>
    ) => {
      if (isPrismaClient(db)) {
        return db.$transaction((tx) => action(tx));
      }
      return action(db);
    };

    return runInTransaction(async (tx) => {
      const record = await tx.oAuthAuthorizationCode.findFirst({
        where: { id: params.id, consumedAt: null, expiresAt: { gt: now } },
      });

      if (!record) {
        return null;
      }

      const entity = mapRecord(record);
      const isValid = params.validate(entity);
      if (!isValid) {
        return null;
      }

      await tx.oAuthAuthorizationCode.delete({ where: { id: record.id } });
      return entity;
    });
  }
}

function mapRecord(record: any): AuthorizationCodeEntity {
  return {
    id: record.id,
    userId: record.userId,
    clientId: record.clientId,
    redirectUri: record.redirectUri,
    codeHash: record.codeHash as TokenHashEnvelope,
    codeChallenge: record.codeChallenge,
    codeChallengeMethod: record.codeChallengeMethod as PkceChallengeMethod,
    scopes: record.scopes as PermissionScope[],
    nonce: record.nonce ?? null,
    expiresAt: record.expiresAt,
    consumedAt: record.consumedAt ?? null,
    createdAt: record.createdAt,
  };
}

function isPrismaClient(client: PrismaClientOrTransaction): client is PrismaClient {
  return typeof (client as PrismaClient).$transaction === 'function';
}
