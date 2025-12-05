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
  tokenEndpointAuthMethod:
    | 'none'
    | 'client_secret_basic'
    | 'client_secret_post'
    | 'private_key_jwt';
  disabledAt: Date | null;
};

export type VerifiedIdentity = {
  provider: string;
  providerSubject: string;
  email: string | null;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
  tenantId?: string;
  rawClaims?: Record<string, unknown>;
};

export type WorkspaceSsoBindingMode = 'invite_only' | 'auto_provision';

export type WorkspaceSsoBinding = {
  provider: string; // e.g. saml:okta-main, auth0:enterprise-connection
  workspaceId: string;
  mode: WorkspaceSsoBindingMode;
  defaultRole?: WorkspaceRole | null;
  allowedEmailDomains?: string[];
};

export type ServiceType = 'internal' | 'external';

export type AuthContext = {
  userId: string;
  sessionId: string | null;
  principalType: 'anonymous' | 'user' | 'service';
  serviceId: string | null;
  serviceType: ServiceType | null;
  clientId: string | null;
  clientType: ClientType;
  tokenId: string | null;
  membershipId: string | null;
  activeWorkspaceId: string | null;
  allowedWorkspaces: string[] | null;
  scopes: PermissionScope[];
  roles: WorkspaceRole[];
  profileId: string | null;
  requestId?: string;
  mfaLevel: MfaLevel;
  authTime: Date | null;
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
  clientIdClaim?: string | null;
  serviceIdClaim?: string | null;
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
  ipAddress?: string | null;
  userAgent?: string | null;
  mfaLevel?: MfaLevel;
  workspaceId?: string | null;
  rememberMe?: boolean;
};

export type CreateSessionWithRefreshInput = CreateSessionInput & {
  refreshMetadata?: Record<string, unknown> | null;
  refreshFamilyId?: string | null;
};

export type CreateSessionWithRefreshResult = {
  session: SessionHandle;
  refresh: IssueRefreshTokenResult;
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

export type IssueRefreshTokenInput = {
  userId: string;
  sessionId: string;
  expiresAt: Date;
  metadata?: Record<string, unknown> | null;
  familyId?: string | null;
};

export type IssueRefreshTokenResult = {
  refreshToken: string;
  token: RefreshTokenRecord;
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
  familyId: string | null;
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
  pty?: 'user' | 'service';
  client_id?: string;
  awp?: string[];
  wid?: string | null;
  act?: string | null;
  token_use: 'access';
  jti: string;
  iat: number;
  exp: number;
  client_type?: ClientType;
  mfa_level?: MfaLevel;
  reauth_at?: number;
  scp?: string[];
};

export type SessionSummary = {
  id: string;
  userId: string;
  revokedAt?: Date | null;
};

export type SsoLogoutEvent = {
  provider: string;
  providerSubject: string;
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

export type IdTokenClaims = {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  auth_time: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};
