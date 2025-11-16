import type { Prisma, PrismaClient } from '@prisma/client';

export type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient;

export type PostgresAppContext = {
  userId: string | null;
  profileId: string | null;
  workspaceId: string | null;
};

const UUID_REGEX = /^[0-9a-f-]{36}$/i;

function buildSetStatement(guc: string, value: string | null): string | null {
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
    buildSetStatement('app.user_id', context.userId),
    buildSetStatement('app.profile_id', context.profileId),
    buildSetStatement('app.workspace_id', context.workspaceId),
  ].filter((statement): statement is string => Boolean(statement));

  for (const statement of statements) {
    await client.$executeRawUnsafe(statement);
  }
}
