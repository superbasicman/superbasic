import type {
  AuthContext,
  CreateSessionInput,
  CreateSessionWithRefreshInput,
  CreateSessionWithRefreshResult,
  IssuePersonalAccessTokenInput,
  IssueRefreshTokenInput,
  IssueRefreshTokenResult,
  IssuedToken,
  OAuthClientRecord,
  OAuthInitiationResult,
  PermissionScope,
  RefreshTokenRecord,
  RevokeSessionInput,
  RevokeTokenInput,
  SessionHandle,
  TokenHashEnvelope,
  VerifiedIdentity,
  VerifyRequestInput,
  WorkspaceAssertionOptions,
  WorkspaceRole,
} from './types.js';

export interface OAuthClientRepository {
  findByClientId(clientId: string): Promise<OAuthClientRecord | null>;
  findClientSecret(clientId: string): Promise<TokenHashEnvelope | null>;
}

export interface RefreshTokenRepository {
  create(data: {
    id: string;
    userId: string;
    sessionId: string;
    hashEnvelope: TokenHashEnvelope;
    scopes: string[];
    familyId: string;
    last4: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord>;
}

export interface AuthUserRepository {
  findById(id: string): Promise<{
    id: string;
    userState: string;
    primaryEmail: string;
    profileId?: string | null;
  } | null>;
}

export interface AuthSessionRepository {
  create(
    data: {
      userId: string;
      expiresAt: Date;
      lastActivityAt: Date;
      mfaLevel: string;
      ipAddress?: string | null;
      clientInfo: unknown;
    },
    identity?: {
      provider: string;
      providerSubject: string;
      email?: string | null;
      emailVerified?: boolean | null;
      rawClaims?: unknown;
    }
  ): Promise<{
    id: string;
    userId: string;
    expiresAt: Date;
    mfaLevel: string;
    ipAddress?: string | null;
    clientInfo?: unknown;
    createdAt: Date;
  }>;

  findById(id: string): Promise<{
    id: string;
    userId: string;
    expiresAt: Date;
    revokedAt?: Date | null;
    mfaLevel: string;
    lastActivityAt?: Date | null;
    clientInfo?: unknown;
  } | null>;
}

export interface WorkspaceMembershipRepository {
  findManyByUserId(userId: string): Promise<Array<{ workspaceId: string; role: string }>>;
  findFirst(
    userId: string,
    workspaceId: string
  ): Promise<{ workspaceId: string; role: string } | null>;
}

export interface ApiKeyRepository {
  create(data: {
    id: string;
    userId: string;
    workspaceId?: string | null;
    keyHash: TokenHashEnvelope;
    scopes: string[];
    name: string;
    last4: string;
    expiresAt: Date;
  }): Promise<{
    id: string;
    userId: string;
    scopes: string[];
    name: string | null;
    workspaceId: string | null;
    expiresAt: Date;
  }>;

  findById(id: string): Promise<{
    id: string;
    userId: string;
    keyHash: TokenHashEnvelope;
    scopes: string[];
    name: string | null;
    workspaceId: string | null;
    expiresAt: Date;
    revokedAt?: Date | null;
    createdAt: Date;
    user: {
      id: string;
      userState: string;
      profileId?: string | null;
    };
  } | null>;

  revoke(id: string): Promise<void>;
}

export interface AuthProfileRepository {
  ensureExists(userId: string): Promise<string>;
}

export interface IdentityProvider {
  authenticateWithCredentials(email: string, password: string): Promise<VerifiedIdentity>;
  initiateOAuth(provider: string, redirectUri?: string): Promise<OAuthInitiationResult>;
  handleOAuthCallback(
    params: URLSearchParams | Record<string, string | string[]>
  ): Promise<VerifiedIdentity>;
  sendMagicLink(email: string): Promise<void>;
  verifyMagicLink(token: string): Promise<VerifiedIdentity>;
}

export interface AuthService {
  verifyRequest(input: VerifyRequestInput): Promise<AuthContext | null>;
  createSession(input: CreateSessionInput): Promise<SessionHandle>;
  createSessionWithRefresh(
    input: CreateSessionWithRefreshInput
  ): Promise<CreateSessionWithRefreshResult>;
  revokeSession(input: RevokeSessionInput): Promise<void>;
  issueRefreshToken(input: IssueRefreshTokenInput): Promise<IssueRefreshTokenResult>;
  issuePersonalAccessToken(input: IssuePersonalAccessTokenInput): Promise<IssuedToken>;
  revokeToken(input: RevokeTokenInput): Promise<void>;
}

export interface AuthzService {
  hasScope(auth: AuthContext | null, scope: PermissionScope): boolean;
  requireScope(auth: AuthContext | null, scope: PermissionScope): asserts auth is AuthContext;
  hasAnyScope(auth: AuthContext | null, scopes: PermissionScope[]): boolean;
  requireAnyScope(auth: AuthContext | null, scopes: PermissionScope[]): asserts auth is AuthContext;
  hasWorkspaceRole(auth: AuthContext | null, role: WorkspaceRole): boolean;
  requireWorkspaceRole(auth: AuthContext | null, role: WorkspaceRole): asserts auth is AuthContext;
  assertWorkspaceAccess(
    auth: AuthContext | null,
    options?: WorkspaceAssertionOptions
  ): string | null;
}
