import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { COOKIE_NAME } from '@repo/auth';
import type { AppBindings } from '../../../types/context.js';

const CLIENT_TYPES = ['web', 'mobile', 'cli', 'partner', 'other'] as const;

const AuthTokenRequestSchema = z.object({
  sessionToken: z.string().optional(),
  clientType: z.enum(CLIENT_TYPES).optional(),
  rememberMe: z.boolean().optional(),
});

type AuthTokenRequest = z.infer<typeof AuthTokenRequestSchema>;
type ValidatedJsonRequest = {
  valid: (type: 'json') => AuthTokenRequest;
};

export const authTokenValidator = zValidator('json', AuthTokenRequestSchema, (result, c) => {
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

export async function exchangeAuthTokens(c: Context<AppBindings>) {
  const payload = (c.req as typeof c.req & ValidatedJsonRequest).valid('json');
  const sessionToken = payload.sessionToken ?? getCookie(c, COOKIE_NAME);

  if (!sessionToken) {
    return c.json(
      { error: 'invalid_grant', message: 'Session token is required to exchange for API tokens.' },
      401
    );
  }

  // Legacy Auth.js session exchange is no longer supported now that we are fully on AuthCore.
  return c.json(
    {
      error: 'unsupported_grant_type',
      message: 'Session-token exchange has been removed. Use login to obtain API tokens.',
    },
    410
  );
}
