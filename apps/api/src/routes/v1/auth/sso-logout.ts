import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { prisma } from '@repo/database';
import { planBackChannelLogout } from '@repo/auth-core';
import { revokeSessionForUser } from '../../../lib/session-revocation.js';
import type { AppBindings } from '../../../types/context.js';

const SsoLogoutSchema = z.object({
  provider: z.string().min(1),
  providerUserId: z.string().min(1),
  sessionIds: z.array(z.string().min(1)).optional(),
});

type ValidatedRequest = {
  valid: (type: 'json') => z.infer<typeof SsoLogoutSchema>;
};

export const ssoLogoutValidator = zValidator('json', SsoLogoutSchema, (result, c) => {
  if (!result.success) {
    const issues =
      'error' in result && result.error ? result.error.issues : [{ message: 'Invalid payload' }];
    return c.json(
      {
        error: 'invalid_request',
        message: 'Request payload is invalid',
        issues,
      },
      400
    );
  }
});

export async function handleSsoLogout(c: Context<AppBindings>) {
  const payload = (c.req as typeof c.req & ValidatedRequest).valid('json');

  const identities = await prisma.userIdentity.findMany({
    where: {
      provider: payload.provider as any,
      providerSubject: payload.providerUserId,
    },
    select: {
      userId: true,
      provider: true,
      providerSubject: true,
    },
  });

  if (identities.length === 0) {
    return c.body(null, 202);
  }

  const activeSessions = await prisma.authSession.findMany({
    where: {
      userId: { in: identities.map((i) => i.userId) },
      revokedAt: null,
    },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
    },
  });

  const plan = planBackChannelLogout(
    {
      provider: payload.provider,
      providerUserId: payload.providerUserId,
      sessionIds: payload.sessionIds ?? [],
    },
    identities.map((identity) => ({
      provider: identity.provider,
      providerUserId: identity.providerSubject,
      userId: identity.userId,
    })),
    activeSessions
  );

  if (plan.sessionIds.length === 0) {
    return c.body(null, 202);
  }

  const sessionOwners = await prisma.authSession.findMany({
    where: { id: { in: plan.sessionIds } },
    select: { id: true, userId: true },
  });
  const ownerMap = new Map(sessionOwners.map((row) => [row.id, row.userId]));

  await Promise.all(
    plan.sessionIds.map(async (sessionId) => {
      const userId = ownerMap.get(sessionId);
      if (!userId) {
        return;
      }
      await revokeSessionForUser({
        sessionId,
        userId,
        revokedBy: 'sso_logout',
        reason: 'sso_backchannel_logout',
      });
    })
  );

  return c.body(null, 202);
}
