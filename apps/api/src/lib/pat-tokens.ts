import type { PermissionScope } from '@repo/auth-core';
import { tokenService } from '../services/index.js';

type RequestContext = {
  ip?: string;
  userAgent?: string;
  requestId?: string;
  workspaceId?: string | null;
};

const DEFAULT_EXPIRATION_DAYS = 90;

export async function issuePersonalAccessToken(options: {
  userId: string;
  profileId: string;
  name: string;
  scopes: PermissionScope[];
  expiresInDays?: number;
  workspaceId?: string | null;
  requestContext?: RequestContext;
}) {
  const expiresInDays = options.expiresInDays ?? DEFAULT_EXPIRATION_DAYS;
  const requestContext = toTokenRequestContext(options.requestContext);
  const result = await tokenService.createToken({
    userId: options.userId,
    name: options.name,
    scopes: options.scopes,
    workspaceId: options.workspaceId ?? options.requestContext?.workspaceId ?? null,
    expiresInDays,
    ...(requestContext ? { requestContext } : {}),
  });

  return { ...result.apiKey, token: result.token };
}

export async function listPersonalAccessTokens(userId: string) {
  return tokenService.listTokens({ userId });
}

export async function renamePersonalAccessToken(options: {
  tokenId: string;
  userId: string;
  name: string;
  requestContext?: RequestContext;
}) {
  const requestContext = toTokenRequestContext(options.requestContext);
  return tokenService.updateToken({
    id: options.tokenId,
    userId: options.userId,
    name: options.name,
    ...(requestContext ? { requestContext } : {}),
  });
}

export async function revokePersonalAccessToken(options: {
  tokenId: string;
  userId: string;
  requestContext?: RequestContext;
}) {
  const requestContext = toTokenRequestContext(options.requestContext);
  return tokenService.revokeToken({
    id: options.tokenId,
    userId: options.userId,
    ...(requestContext ? { requestContext } : {}),
  });
}

function toTokenRequestContext(
  context?: RequestContext
): { ip?: string; userAgent?: string; requestId?: string } | undefined {
  if (!context) {
    return undefined;
  }

  const { ip, userAgent, requestId } = context;
  const cleaned: { ip?: string; userAgent?: string; requestId?: string } = {};

  if (ip) cleaned.ip = ip;
  if (userAgent) cleaned.userAgent = userAgent;
  if (requestId) cleaned.requestId = requestId;

  return Object.keys(cleaned).length ? cleaned : undefined;
}
