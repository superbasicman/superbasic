import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import {
  COOKIE_NAME,
  parseOpaqueToken,
  verifyTokenSecret,
  type TokenHashEnvelope,
} from '@repo/auth';
import { prisma } from '@repo/database';
import type { AppBindings } from '../../../types/context.js';

async function loadLegacySession(c: Context<AppBindings>) {
  const rawCookie = getCookie(c, COOKIE_NAME);
  if (!rawCookie) {
    return null;
  }

  const parsed = parseOpaqueToken(rawCookie);
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

  if (!sessionRow) {
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

export async function getCurrentSession(c: Context<AppBindings>) {
  const auth = c.get('auth');

  if (!auth) {
    const legacy = await loadLegacySession(c);
    if (legacy) {
      return c.json({
        auth: null,
        user: legacy.user,
        session: legacy.session,
      });
    }
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const session = auth.sessionId
    ? await prisma.session.findUnique({
        where: { id: auth.sessionId },
        select: {
          id: true,
          clientType: true,
          kind: true,
          lastUsedAt: true,
          createdAt: true,
          expiresAt: true,
          absoluteExpiresAt: true,
          mfaLevel: true,
        },
      })
    : null;

  return c.json({
    auth,
    user,
    session,
  });
}
