import { AuthorizationError, UnauthorizedError } from './errors.js';
import type { AuthContext, MfaLevel } from './types.js';

const MFA_ORDER: Record<MfaLevel, number> = {
  none: 0,
  mfa: 1,
  phishing_resistant: 2,
};

export type RecentAuthOptions = {
  withinSeconds?: number;
  minMfaLevel?: MfaLevel;
  now?: Date;
};

export function requireRecentAuth(
  auth: AuthContext | null,
  options: RecentAuthOptions = {}
): asserts auth is AuthContext {
  if (!auth) {
    throw new UnauthorizedError('Authentication required');
  }

  const minMfaLevel = options.minMfaLevel ?? 'none';
  const windowSeconds = options.withinSeconds ?? 10 * 60;
  const now = options.now ?? new Date();

  const effectiveMfa = auth.mfaLevel ?? 'none';
  if (MFA_ORDER[effectiveMfa] < MFA_ORDER[minMfaLevel]) {
    throw new AuthorizationError('Stronger authentication required');
  }

  const recent = auth.authTime ?? null;
  if (!recent) {
    throw new AuthorizationError('Recent authentication required');
  }

  const elapsedMs = now.getTime() - recent.getTime();
  if (elapsedMs > windowSeconds * 1000) {
    throw new AuthorizationError('Recent authentication window expired');
  }
}
