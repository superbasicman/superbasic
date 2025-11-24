import type { Scope } from '@repo/types';

export type ClientType = 'web' | 'mobile' | 'cli' | 'partner' | 'other';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export type WorkspaceRoleScopeMap = Record<WorkspaceRole, readonly PermissionScope[]>;

export type PermissionScope = Scope;
export type TokenType = 'refresh' | 'personal_access';
export type OAuthClientType = 'public' | 'confidential';

export type TokenHashEnvelope = {
  algo: 'hmac-sha256';
  keyId: string;
  hash: string;
  issuedAt: string;
  salt?: string;
  [key: string]: string | undefined;
};

export type MfaLevel = 'none' | 'mfa' | 'phishing_resistant';

export type PkceChallengeMethod = 'S256' | 'plain';

export type PkceChallenge = {
  codeChallenge: string;
  codeChallengeMethod: PkceChallengeMethod;
};

export type OAuthClientRecord = {
  id: string;
  clientId: string;
  type: OAuthClientType;
  redirectUris: string[];
  disabledAt: Date | null;
};

export type VerifiedIdentity = {
  provider: string;
  providerUserId: string;
  email: string | null;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
};

export type WorkspaceSsoBindingMode = 'invite_only' | 'auto_provision';

export type WorkspaceSsoBinding = {
  provider: string; // e.g. saml:okta-main, auth0:enterprise-connection
  workspaceId: string;
  mode: WorkspaceSsoBindingMode;
  defaultRole?: WorkspaceRole | null;
  allowedEmailDomains?: string[];
};

export type AuthContext = {
  userId: string;
  sessionId: string | null;
  clientType: ClientType;
  activeWorkspaceId: string | null;
  scopes: PermissionScope[];
  roles: WorkspaceRole[];
  profileId: string | null;
  requestId?: string;
  mfaLevel: MfaLevel;
  recentlyAuthenticatedAt?: Date | null;
};

export type VerifyRequestInput = {
  authorizationHeader?: string;
  cookies?: Record<string, string>;
  ipAddress?: string;
  userAgent?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  workspaceHeader?: string | null;
  workspacePathParam?: string | null;
  requestId?: string;
};

export type SessionHandle = {
  sessionId: string;
  userId: string;
  clientType: ClientType;
  activeWorkspaceId?: string | null;
  createdAt: Date;
  expiresAt: Date;
  absoluteExpiresAt?: Date | null;
  mfaLevel: MfaLevel;
};

export type CreateSessionInput = {
  userId: string;
  identity: VerifiedIdentity;
  clientType: ClientType;
  ipAddress?: string;
  userAgent?: string;
  mfaLevel?: MfaLevel;
  workspaceId?: string | null;
  rememberMe?: boolean;
};

export type RevokeSessionInput = {
  sessionId: string;
  reason?: string;
  revokedBy?: string;
};

export type IssuePersonalAccessTokenInput = {
  userId: string;
  workspaceId?: string | null;
  scopes: PermissionScope[];
  name: string;
  expiresAt?: Date | null;
};

export type RevokeTokenInput = {
  tokenId: string;
  revokedBy?: string;
  reason?: string;
};

export type IssuedToken = {
  tokenId: string;
  secret: string;
  type: TokenType;
  scopes: PermissionScope[];
  name?: string;
  workspaceId?: string | null;
  expiresAt?: Date | null;
};

export type TokenRecord = {
  id: string;
  userId: string;
  sessionId: string | null;
  workspaceId: string | null;
  type: TokenType;
  tokenHash: TokenHashEnvelope;
  scopes: PermissionScope[];
  name: string | null;
  familyId: string | null;
  metadata: Record<string, unknown> | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RefreshTokenRecord = TokenRecord & {
  type: 'refresh';
  sessionId: string;
  familyId: string;
  expiresAt: Date;
};

export type OAuthInitiationResult = {
  url: string;
  state?: string;
  codeVerifier?: string;
};

export type WorkspaceAssertionOptions = {
  workspaceId?: string | null;
  allowNull?: boolean;
};

export type AccessTokenClaims = {
  iss: string;
  aud: string | string[];
  sub: string;
  sid?: string | null;
  wid?: string | null;
  act?: string | null;
  token_use: 'access';
  jti: string;
  iat: number;
  exp: number;
  client_type?: ClientType;
  mfa_level?: MfaLevel;
  reauth_at?: number;
};

export type SessionSummary = {
  id: string;
  userId: string;
  revokedAt?: Date | null;
};

export type SsoLogoutEvent = {
  provider: string;
  providerUserId: string;
  sessionIds?: string[];
};

export type SsoLogoutPlan = {
  userIds: string[];
  sessionIds: string[];
};

export type SsoLoginResolution = {
  userId: string | null;
  action: 'link' | 'create';
  reason?: string;
};
