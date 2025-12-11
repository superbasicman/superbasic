export * from './types.js';
export * from './interfaces.js';
export * from './errors.js';
export * from './authz.js';
export * from './pkce.js';
export * from './oauth-clients.js';
export * from './step-up.js';
export * from './sso.js';
export {
  requireOAuthClient,
  findOAuthClient,
  validateRedirectUri,
  normalizeRedirectUri,
  isFirstPartyClient,
} from './oauth-clients.js';
export { extractClientSecret, authenticateConfidentialClient } from './oauth-client-auth.js';
export {
  PrismaOAuthClientRepository,
  PrismaRefreshTokenRepository,
  PrismaAuthUserRepository,
  PrismaAuthSessionRepository,
  PrismaWorkspaceMembershipRepository,
  PrismaApiKeyRepository,
  PrismaAuthProfileRepository,
} from './prisma-repositories.js';
export {
  AuthCoreService,
  createAuthService,
  generateAccessToken,
  generateIdToken,
} from './service.js';
export {
  sendMagicLinkEmail,
  sendVerificationEmail,
  getRecipientLogId,
} from './email.js';
export {
  authEvents,
  type AuthEvent,
  type AuthEventHandler,
  type AuthEventType,
  type TokenCreatedEvent,
  type TokenUsedEvent,
  type TokenRevokedEvent,
  type TokenAuthFailedEvent,
  type TokenScopeDeniedEvent,
  type TokenUpdatedEvent,
  type RefreshRotatedEvent,
  type SessionRevokedEvent,
  type RefreshReuseDetectedEvent,
  type UserStatusChangedEvent,
} from './events.js';
export {
  generateToken,
  hashToken,
  verifyToken,
  isValidTokenFormat,
  extractTokenFromHeader,
} from './pat.js';
export {
  createOpaqueToken,
  parseOpaqueToken,
  createTokenHashEnvelope,
  verifyTokenSecret,
} from './token-hash.js';
export type { TokenHashEnvelope, OpaqueToken } from './token-hash.js';
export {
  generateSessionTransferToken,
  parseSessionTransferToken,
  verifySessionTransferToken,
  SESSION_TRANSFER_TTL_SECONDS,
} from './session-transfer.js';
export {
  VALID_SCOPES,
  isValidScope,
  validateScopes,
  hasScope,
  hasAllScopes,
  hasAnyScope,
  RBAC_SCOPES,
  RBAC_ROLES,
} from './rbac.js';
export type { Scope, RBACScope, RBACRole } from './rbac.js';
export type { SignAccessTokenParams, SignIdTokenParams } from './signing.js';
export { TokenService } from './token-service.js';
export type { IssueRefreshTokenInput, IssueRefreshTokenResult } from './types.js';
export type { CreateSessionWithRefreshInput, CreateSessionWithRefreshResult } from './types.js';
