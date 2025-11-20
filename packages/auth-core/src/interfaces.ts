import type {
  AuthContext,
  CreateSessionInput,
  IssuePersonalAccessTokenInput,
  IssuedToken,
  OAuthInitiationResult,
  PermissionScope,
  RevokeSessionInput,
  RevokeTokenInput,
  SessionHandle,
  VerifiedIdentity,
  VerifyRequestInput,
  WorkspaceAssertionOptions,
  WorkspaceRole,
} from './types.js';

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
  revokeSession(input: RevokeSessionInput): Promise<void>;
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
