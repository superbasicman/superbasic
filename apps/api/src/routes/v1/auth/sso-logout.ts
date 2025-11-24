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
    return c.json(
      {
        error: 'invalid_request',
        issues: result.error.issues,
      },
      400
    );
  }
});

export async function handleSsoLogout(c: Context<AppBindings>) {
  const payload = (c.req as typeof c.req & ValidatedRequest).valid('json');

  const identities = await prisma.userIdentity.findMany({
    where: {
      provider: payload.provider,
      providerUserId: payload.providerUserId,
    },
    select: {
      userId: true,
      provider: true,
      providerUserId: true,
    },
  });

  if (identities.length === 0) {
    return c.body(null, 202);
  }

  const activeSessions = await prisma.session.findMany({
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
    identities,
    activeSessions
  );

  if (plan.sessionIds.length === 0) {
    return c.body(null, 202);
  }

  const sessionOwners = await prisma.session.findMany({
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
