export type ClientType = 'web' | 'mobile' | 'cli' | 'partner' | 'other';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export type PermissionScope = string;

export type MfaLevel = 'none' | 'mfa' | 'phishing_resistant';

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

export type AuthContext = {
  userId: string;
  sessionId: string | null;
  clientType: ClientType;
  activeWorkspaceId: string | null;
  scopes: PermissionScope[];
  roles: WorkspaceRole[];
  profileId: string | null;
  requestId?: string;
  mfaLevel?: MfaLevel;
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
  type: 'refresh' | 'personal_access';
  scopes: PermissionScope[];
  name?: string;
  workspaceId?: string | null;
  expiresAt?: Date | null;
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
};
