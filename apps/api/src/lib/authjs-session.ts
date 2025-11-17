import { parseOpaqueToken, verifyTokenSecret, type TokenHashEnvelope } from '@repo/auth';
import { prisma } from '@repo/database';

export type LegacyAuthSession = {
  user: {
    id: string;
    email: string;
    name: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  };
  session: {
    id: string;
    clientType: string;
    kind: string;
    lastUsedAt: Date | null;
    createdAt: Date;
    expiresAt: Date;
    absoluteExpiresAt: Date | null;
    mfaLevel: string | null;
  };
};

export async function loadLegacyAuthSession(
  sessionToken: string
): Promise<LegacyAuthSession | null> {
  const parsed = parseOpaqueToken(sessionToken);
  if (!parsed) {
    return null;
  }

  const sessionRow = await prisma.session.findUnique({
    where: { tokenId: parsed.tokenId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!sessionRow || !sessionRow.user) {
    return null;
  }

  const isValid = verifyTokenSecret(
    parsed.tokenSecret,
    sessionRow.sessionTokenHash as TokenHashEnvelope
  );

  if (!isValid || sessionRow.expiresAt < new Date()) {
    return null;
  }

  return {
    user: sessionRow.user,
    session: {
      id: sessionRow.id,
      clientType: sessionRow.clientType,
      kind: sessionRow.kind,
      lastUsedAt: sessionRow.lastUsedAt,
      createdAt: sessionRow.createdAt,
      expiresAt: sessionRow.expiresAt,
      absoluteExpiresAt: sessionRow.absoluteExpiresAt,
      mfaLevel: sessionRow.mfaLevel,
    },
  };
}
