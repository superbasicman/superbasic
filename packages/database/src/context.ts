import type { Prisma, PrismaClient } from '@prisma/client';

export type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient;

export type PostgresAppContext = {
  userId: string | null;
  profileId: string | null;
  workspaceId: string | null;
  mfaLevel: 'none' | 'mfa' | 'phishing_resistant' | null;
};

const UUID_REGEX = /^[0-9a-f-]{36}$/i;
const MFA_LEVELS = new Set(['none', 'mfa', 'phishing_resistant']);

function buildUuidSetStatement(guc: string, value: string | null): string | null {
  if (!value) {
    return `RESET ${guc};`;
  }

  if (!UUID_REGEX.test(value)) {
    throw new Error(`Invalid UUID value provided for ${guc}`);
  }

  return `SET ${guc} = '${value}';`;
}

export async function setPostgresContext(
  client: PrismaClientOrTransaction,
  context: PostgresAppContext
): Promise<void> {
  const statements = [
    buildUuidSetStatement('app.user_id', context.userId),
    buildUuidSetStatement('app.profile_id', context.profileId),
    buildUuidSetStatement('app.workspace_id', context.workspaceId),
    buildMfaLevelStatement('app.mfa_level', context.mfaLevel),
  ].filter((statement): statement is string => Boolean(statement));

  for (const statement of statements) {
    await client.$executeRawUnsafe(statement);
  }
}

export async function resetPostgresContext(client: PrismaClientOrTransaction): Promise<void> {
  return setPostgresContext(client, {
    userId: null,
    profileId: null,
    workspaceId: null,
    mfaLevel: null,
  });
}

function buildMfaLevelStatement(guc: string, value: PostgresAppContext['mfaLevel']): string | null {
  if (!value) {
    return `RESET ${guc};`;
  }

  if (!MFA_LEVELS.has(value)) {
    throw new Error(`Invalid MFA level provided for ${guc}`);
  }

  return `SET ${guc} = '${value}';`;
}
