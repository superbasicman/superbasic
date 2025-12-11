import { createOpaqueToken, createTokenHashEnvelope, verifyTokenSecret } from '@repo/auth-core';
import { AuthorizationError } from '@repo/auth-core';
import type { PermissionScope, PkceChallengeMethod, TokenHashEnvelope } from '@repo/auth-core';
import { authorizationCodeRepository } from '../services/index.js';
import type { AuthorizationCodeEntity } from '@repo/core';

const DEFAULT_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type IssueAuthorizationCodeInput = {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: PkceChallengeMethod;
  scopes?: PermissionScope[];
  nonce?: string | null;
  expiresInMs?: number;
};

export type AuthorizationCodeRecord = AuthorizationCodeEntity;

export async function issueAuthorizationCode(
  input: IssueAuthorizationCodeInput
): Promise<{ code: string; record: AuthorizationCodeRecord }> {
  const expiresInMs = input.expiresInMs ?? DEFAULT_CODE_TTL_MS;
  const expiresAt = new Date(Date.now() + expiresInMs);
  const opaque = createOpaqueToken();
  const codeHash = createTokenHashEnvelope(opaque.tokenSecret);
  const scopes = dedupeScopes(input.scopes ?? []);

  const record = await authorizationCodeRepository.create({
    id: opaque.tokenId,
    userId: input.userId,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    codeHash,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    scopes,
    nonce: input.nonce ?? null,
    expiresAt,
  });

  return { code: opaque.value, record };
}

function dedupeScopes(scopes: PermissionScope[]): PermissionScope[] {
  return Array.from(new Set(scopes.filter(Boolean))) as PermissionScope[];
}

export const AUTHORIZATION_CODE_TTL_MS = DEFAULT_CODE_TTL_MS;

export async function consumeAuthorizationCode(params: {
  codeId: string;
  codeSecret: string;
}): Promise<AuthorizationCodeRecord> {
  const record = await authorizationCodeRepository.consume({
    id: params.codeId,
    validate: (code) =>
      verifyTokenSecret(params.codeSecret, code.codeHash as unknown as TokenHashEnvelope),
  });

  if (!record) {
    throw new AuthorizationError('Invalid or expired authorization code');
  }

  return record;
}
