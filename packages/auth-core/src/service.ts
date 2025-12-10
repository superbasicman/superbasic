import {
  SESSION_MAX_AGE_SECONDS,
  createOpaqueToken,
  createTokenHashEnvelope,
  parseOpaqueToken,
  verifyTokenSecret,
} from '@repo/auth';
import { type PrismaClient, prisma, setPostgresContext } from '@repo/database';
import { jwtVerify } from 'jose';
import { GLOBAL_PERMISSION_SCOPES, deriveScopesFromRoles, isWorkspaceRole } from './authz.js';
import { type AuthCoreEnvironment, loadAuthCoreConfig } from './config.js';
import { AuthorizationError, InactiveUserError, UnauthorizedError } from './errors.js';
import type {
  ApiKeyRepository,
  AuthProfileRepository,
  AuthService,
  AuthSessionRepository,
  AuthUserRepository,
  WorkspaceMembershipRepository,
} from './interfaces.js';
import {
  PrismaApiKeyRepository,
  PrismaAuthProfileRepository,
  PrismaAuthSessionRepository,
  PrismaAuthUserRepository,
  PrismaRefreshTokenRepository,
  PrismaWorkspaceMembershipRepository,
} from './prisma-repositories.js';
import {
  type SignAccessTokenParams,
  type SignIdTokenParams,
  SigningKeyStore,
  buildSigningKey,
  buildVerificationKey,
  signAccessToken,
  signIdToken,
} from './signing.js';
import { TokenService } from './token-service.js';
import type {
  AccessTokenClaims,
  AuthContext,
  ClientType,
  CreateSessionInput,
  CreateSessionWithRefreshInput,
  CreateSessionWithRefreshResult,
  IssuePersonalAccessTokenInput,
  IssueRefreshTokenInput,
  IssueRefreshTokenResult,
  IssuedToken,
  MfaLevel,
  PermissionScope,
  RevokeSessionInput,
  RevokeTokenInput,
  SessionHandle,
  VerifyRequestInput,
  WorkspaceRole,
} from './types.js';

export type IssueAccessTokenInput = {
  userId: string;
  sessionId?: string | null;
  workspaceId?: string | null;
  clientType?: ClientType;
  mfaLevel?: MfaLevel;
};

type AuthCoreServiceDependencies = {
  prisma: PrismaClient;
  userRepo: AuthUserRepository;
  sessionRepo: AuthSessionRepository;
  membershipRepo: WorkspaceMembershipRepository;
  apiKeyRepo: ApiKeyRepository;
  profileRepo: AuthProfileRepository;
  keyStore: SigningKeyStore;
  issuer: string;
  audience: string;
  clockToleranceSeconds: number;
  setContext?: typeof setPostgresContext;
  tokenService?: TokenService;
  onSessionCreated?: (session: {
    id: string;
    userId: string;
    ipAddress: string | null;
    userAgent: string | null;
  }) => void;
};

function extractBearer(header?: string): string | null {
  if (!header) {
    return null;
  }
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

type SigningResources = {
  keyStore: SigningKeyStore;
  config: AuthCoreEnvironment;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WORKSPACE_ROLE_ALIASES: Record<string, WorkspaceRole> = {
  readonly: 'viewer',
};

type WorkspaceResolution = {
  workspaceId: string | null;
  allowedWorkspaceIds: string[];
  roles: WorkspaceRole[];
  scopes: PermissionScope[];
};

type WorkspaceSelectorSource = 'path' | 'header' | 'hint';

const CLIENT_TYPE_VALUES: ClientType[] = ['web', 'mobile', 'cli', 'partner', 'other'];

function normalizeClientType(value?: string | ClientType | null): ClientType {
  if (!value) {
    return 'web';
  }
  if (CLIENT_TYPE_VALUES.includes(value as ClientType)) {
    return value as ClientType;
  }
  return 'other';
}

let signingResourcesPromise: Promise<SigningResources> | null = null;

async function buildKeyStoreFromConfig(config: AuthCoreEnvironment) {
  const signingKey = await buildSigningKey(config);
  const verificationKeys = await Promise.all(
    (config.verificationKeys ?? []).map((keyConfig) => buildVerificationKey(keyConfig))
  );

  return new SigningKeyStore([signingKey, ...verificationKeys], config.keyId);
}

async function getDefaultSigningResources(): Promise<SigningResources> {
  if (!signingResourcesPromise) {
    signingResourcesPromise = (async () => {
      const config = loadAuthCoreConfig();
      return {
        config,
        keyStore: await buildKeyStoreFromConfig(config),
      };
    })();
  }

  return signingResourcesPromise;
}

export class AuthCoreService implements AuthService {
  private readonly prisma: PrismaClient;
  private readonly userRepo: AuthUserRepository;
  private readonly sessionRepo: AuthSessionRepository;
  private readonly membershipRepo: WorkspaceMembershipRepository;
  private readonly apiKeyRepo: ApiKeyRepository;
  private readonly profileRepo: AuthProfileRepository;
  private readonly keyStore: SigningKeyStore;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly clockToleranceSeconds: number;
  private readonly setContext: typeof setPostgresContext;
  private readonly tokenService: TokenService;
  private readonly onSessionCreated?: (session: {
    id: string;
    userId: string;
    ipAddress: string | null;
    userAgent: string | null;
  }) => void;

  constructor(dependencies: AuthCoreServiceDependencies) {
    this.prisma = dependencies.prisma;
    this.userRepo = dependencies.userRepo;
    this.sessionRepo = dependencies.sessionRepo;
    this.membershipRepo = dependencies.membershipRepo;
    this.apiKeyRepo = dependencies.apiKeyRepo;
    this.profileRepo = dependencies.profileRepo;
    this.keyStore = dependencies.keyStore;
    this.issuer = dependencies.issuer;
    this.audience = dependencies.audience;
    this.clockToleranceSeconds = dependencies.clockToleranceSeconds;
    this.setContext = dependencies.setContext ?? setPostgresContext;
    this.tokenService =
      dependencies.tokenService ??
      new TokenService({ repo: new PrismaRefreshTokenRepository(this.prisma) });
    if (dependencies.onSessionCreated) {
      this.onSessionCreated = dependencies.onSessionCreated;
    }
  }

  async verifyRequest(input: VerifyRequestInput): Promise<AuthContext | null> {
    const token = extractBearer(input.authorizationHeader);
    if (!token) {
      return null;
    }

    const opaque = parseOpaqueToken(token, { expectedPrefix: 'sbf' });
    if (opaque) {
      return this.verifyPersonalAccessToken({
        tokenSecret: opaque.tokenSecret,
        tokenId: opaque.tokenId,
        request: input,
      });
    }

    const verification = await this.verifyJwt(token);
    const payload = verification.payload as AccessTokenClaims;

    if (!payload.sub) {
      throw new UnauthorizedError('Access token missing subject');
    }

    if (payload.token_use !== 'access') {
      throw new UnauthorizedError('Unsupported token type');
    }

    if (payload.pty === 'service') {
      const activeWorkspaceId =
        typeof payload.wid === 'string' && payload.wid.length > 0 ? payload.wid : null;
      const allowedWorkspaces =
        Array.isArray(payload.awp) && payload.awp.length > 0
          ? payload.awp.filter((id): id is string => typeof id === 'string' && id.length > 0)
          : activeWorkspaceId
            ? [activeWorkspaceId]
            : [];

      const authContext: AuthContext = {
        userId: payload.sub,
        sessionId: null,
        principalType: 'service',
        serviceId: payload.sub,
        serviceType: 'external',
        clientId: payload.client_id ?? null,
        clientType: payload.client_type ?? 'other',
        tokenId: null,
        membershipId: null,
        activeWorkspaceId,
        allowedWorkspaces,
        scopes: (payload.scp ?? []) as PermissionScope[],
        roles: [],
        profileId: null,
        mfaLevel: 'none',
        authTime: payload.reauth_at ? new Date(payload.reauth_at * 1000) : null,
      };

      await this.setContext(this.prisma, {
        userId: null,
        profileId: null,
        workspaceId: activeWorkspaceId,
        mfaLevel: null,
        serviceId: payload.sub,
      });

      if (input.requestId) {
        authContext.requestId = input.requestId;
      }

      return authContext;
    }

    const sessionId =
      typeof payload.sid === 'string' && payload.sid.length > 0 ? payload.sid : null;
    const workspaceHint =
      typeof payload.wid === 'string' && payload.wid.length > 0 ? payload.wid : null;
    const authTime =
      typeof payload.reauth_at === 'number' && payload.reauth_at > 0
        ? new Date(payload.reauth_at * 1000)
        : payload.iat
          ? new Date(payload.iat * 1000)
          : null;

    return this.buildAuthContext({
      userId: payload.sub,
      sessionId,
      workspaceHint,
      workspaceHeader: input.workspaceHeader ?? null,
      workspacePathParam: input.workspacePathParam ?? null,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(payload.client_type ? { clientTypeClaim: payload.client_type } : {}),
      authTime,
    });
  }

  async createSession(input: CreateSessionInput): Promise<SessionHandle> {
    const user = await this.userRepo.findById(input.userId);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.userState !== 'active') {
      throw new InactiveUserError();
    }

    const clientType = normalizeClientType(input.clientType);
    const now = new Date();
    const ttlSeconds = input.rememberMe ? SESSION_MAX_AGE_SECONDS : 7 * 24 * 60 * 60;
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    // Build client_info JSONB per end-auth-goal.md spec
    const clientInfo = {
      type: clientType,
      userAgent: input.userAgent ?? null,
    };

    // The transaction and identity link is now handled by the repository
    const created = await this.sessionRepo.create(
      {
        userId: user.id,
        expiresAt,
        lastActivityAt: now,
        mfaLevel: input.mfaLevel ?? 'none',
        ipAddress: input.ipAddress ?? null,
        clientInfo,
      },
      input.identity
    );

    if (this.onSessionCreated) {
      const createdClientInfo = (created.clientInfo ?? null) as {
        userAgent?: string | null;
      } | null;
      this.onSessionCreated({
        id: created.id,
        userId: created.userId,
        ipAddress: created.ipAddress ?? null,
        userAgent: createdClientInfo?.userAgent ?? null,
      });
    }

    return {
      sessionId: created.id,
      userId: created.userId,
      clientType,
      activeWorkspaceId: input.workspaceId ?? null,
      createdAt: created.createdAt,
      expiresAt: created.expiresAt,
      mfaLevel: created.mfaLevel as MfaLevel,
    };
  }

  async revokeSession(_input: RevokeSessionInput): Promise<void> {
    throw new Error('AuthCoreService.revokeSession is not implemented yet.');
  }

  async issuePersonalAccessToken(input: IssuePersonalAccessTokenInput): Promise<IssuedToken> {
    if (input.expiresAt && !isValidDate(input.expiresAt)) {
      throw new Error('expiresAt must be a valid Date instance');
    }

    const opaque = createOpaqueToken({ prefix: 'sbf' });
    const envelope = createTokenHashEnvelope(opaque.tokenSecret);

    const created = await this.apiKeyRepo.create({
      id: opaque.tokenId,
      userId: input.userId,
      name: input.name,
      keyHash: envelope,
      last4: opaque.value.slice(-4),
      scopes: input.scopes,
      workspaceId: input.workspaceId ?? null,
      expiresAt: input.expiresAt ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // Default 90 days
    });

    return {
      tokenId: created.id,
      secret: opaque.value,
      type: 'personal_access',
      scopes: created.scopes as PermissionScope[],
      name: created.name ?? '',
      workspaceId: created.workspaceId,
      expiresAt: created.expiresAt,
    };
  }

  async revokeToken(input: RevokeTokenInput): Promise<void> {
    const token = await this.apiKeyRepo.findById(input.tokenId);

    if (!token) {
      throw new UnauthorizedError('Token not found');
    }

    if (token.revokedAt) {
      return;
    }

    await this.apiKeyRepo.revoke(input.tokenId);
  }

  async issueRefreshToken(input: IssueRefreshTokenInput): Promise<IssueRefreshTokenResult> {
    return this.tokenService.issueRefreshToken(input);
  }

  async createSessionWithRefresh(
    input: CreateSessionWithRefreshInput
  ): Promise<CreateSessionWithRefreshResult> {
    const session = await this.createSession(input);
    const refresh = await this.issueRefreshToken({
      userId: session.userId,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      scopes: input.refreshScopes ?? [],
      metadata: input.refreshMetadata ?? null,
      familyId: input.refreshFamilyId ?? null,
    });

    return {
      session,
      refresh,
    };
  }

  async issueAccessToken(
    input: IssueAccessTokenInput
  ): Promise<{ token: string; claims: AccessTokenClaims }> {
    const workspaceResolution = await this.resolveWorkspaceContext({
      userId: input.userId,
      workspaceHint: input.workspaceId ?? null,
      workspaceHeader: null,
      workspacePathParam: null,
    });

    const resources = await getDefaultSigningResources();
    return signAccessToken(resources.keyStore, resources.config, {
      userId: input.userId,
      sessionId: input.sessionId ?? null,
      workspaceId: workspaceResolution.workspaceId,
      clientType: input.clientType ?? 'web',
      mfaLevel: input.mfaLevel ?? 'none',
      scopes: workspaceResolution.scopes,
    });
  }

  async ensureProfileExists(userId: string): Promise<string> {
    return this.profileRepo.ensureExists(userId);
  }

  getJwks() {
    return this.keyStore.getJwks();
  }

  private async verifyJwt(token: string) {
    try {
      return await jwtVerify(
        token,
        async ({ kid }: { kid?: string }) => {
          return this.keyStore.getVerificationKey(kid).publicKey;
        },
        {
          issuer: this.issuer,
          audience: this.audience,
          clockTolerance: this.clockToleranceSeconds,
        }
      );
    } catch (error) {
      throw new UnauthorizedError('Invalid access token', { cause: error });
    }
  }

  private async buildAuthContext(options: {
    userId: string;
    sessionId: string | null;
    workspaceHint?: string | null;
    workspaceHeader?: string | null;
    workspacePathParam?: string | null;
    requestId?: string;
    clientTypeClaim?: string | ClientType;
    authTime?: Date | null;
  }): Promise<AuthContext> {
    const user = await this.userRepo.findById(options.userId);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.userState !== 'active') {
      throw new InactiveUserError();
    }

    const profileId = user.profileId ?? null;

    const session = options.sessionId ? await this.sessionRepo.findById(options.sessionId) : null;

    if (options.sessionId) {
      if (!session || session.userId !== user.id) {
        throw new UnauthorizedError('Session is invalid or no longer exists');
      }

      const now = new Date();
      if (session.revokedAt) {
        throw new UnauthorizedError('Session has been revoked');
      }

      if (session.expiresAt < now) {
        throw new UnauthorizedError('Session expired');
      }
    }

    // Extract clientType from client_info JSONB
    const clientInfo = (session?.clientInfo ?? null) as { type?: string | null } | null;
    const clientType = clientInfo
      ? normalizeClientType(clientInfo.type)
      : normalizeClientType(options.clientTypeClaim);
    const clientId = ((options as Record<string, unknown>).clientIdClaim as string | null) ?? null;
    const serviceId =
      ((options as Record<string, unknown>).serviceIdClaim as string | null) ?? null;
    const mfaLevel = (session?.mfaLevel as MfaLevel) ?? 'none';

    const workspaceResolution = await this.resolveWorkspaceContext({
      userId: user.id,
      workspaceHint: options.workspaceHint ?? null,
      workspaceHeader: options.workspaceHeader ?? null,
      workspacePathParam: options.workspacePathParam ?? null,
    });

    await this.setContext(this.prisma, {
      userId: user.id,
      profileId,
      workspaceId: workspaceResolution.workspaceId,
      mfaLevel,
      serviceId: null,
    });

    // Default to "now" when no explicit auth time signal is available
    const authTimeValue = options.authTime ?? session?.lastActivityAt ?? new Date();

    const authContext: AuthContext = {
      userId: user.id,
      sessionId: session?.id ?? null,
      principalType: 'user',
      serviceId,
      serviceType: null,
      clientId,
      clientType,
      tokenId: null,
      membershipId: null,
      activeWorkspaceId: workspaceResolution.workspaceId,
      allowedWorkspaces: workspaceResolution.allowedWorkspaceIds,
      scopes: workspaceResolution.scopes,
      roles: workspaceResolution.roles,
      profileId,
      mfaLevel,
      authTime: authTimeValue,
    };

    if (options.requestId) {
      authContext.requestId = options.requestId;
    }

    return authContext;
  }

  private async verifyPersonalAccessToken(options: {
    tokenId: string;
    tokenSecret: string;
    request: VerifyRequestInput;
  }): Promise<AuthContext> {
    const token = await this.apiKeyRepo.findById(options.tokenId);

    if (!token) {
      // || token.type !== 'personal_access') {
      throw new UnauthorizedError('Invalid personal access token');
    }

    if (!verifyTokenSecret(options.tokenSecret, token.keyHash)) {
      throw new UnauthorizedError('Invalid personal access token');
    }

    if (token.revokedAt) {
      throw new UnauthorizedError('Token has been revoked');
    }

    if (token.expiresAt && token.expiresAt < new Date()) {
      throw new UnauthorizedError('Token has expired');
    }

    if (token.user.userState !== 'active') {
      throw new InactiveUserError();
    }

    const profileId = token.user.profileId ?? null;
    const forcedWorkspaceId = token.workspaceId ?? null;
    const workspaceHeader = forcedWorkspaceId ?? options.request.workspaceHeader ?? null;
    const workspacePathParam = forcedWorkspaceId
      ? null
      : (options.request.workspacePathParam ?? null);
    const workspaceResolution = await this.resolveWorkspaceContext({
      userId: token.userId,
      workspaceHint: forcedWorkspaceId,
      workspaceHeader,
      workspacePathParam,
    });
    const requestedScopes = (token.scopes ?? []) as PermissionScope[];
    const scopes = intersectScopes(workspaceResolution.scopes, requestedScopes);
    const authContext: AuthContext = {
      userId: token.userId,
      sessionId: null,
      principalType: 'user',
      serviceId: null,
      serviceType: null,
      clientId: null,
      clientType: 'cli',
      tokenId: token.id,
      membershipId: null,
      activeWorkspaceId: workspaceResolution.workspaceId,
      allowedWorkspaces: workspaceResolution.allowedWorkspaceIds,
      scopes,
      roles: workspaceResolution.roles,
      profileId,
      mfaLevel: 'none',
      authTime: token.createdAt,
    };

    if (options.request.requestId) {
      authContext.requestId = options.request.requestId;
    }

    await this.setContext(this.prisma, {
      userId: token.userId,
      profileId,
      workspaceId: workspaceResolution.workspaceId,
      mfaLevel: 'none',
      serviceId: null,
    });

    return authContext;
  }

  private normalizeWorkspaceSelector(
    value: string | null | undefined,
    source: WorkspaceSelectorSource
  ): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (!UUID_REGEX.test(trimmed)) {
      if (source === 'hint') {
        return null;
      }
      throw new AuthorizationError('Invalid workspace identifier');
    }
    return trimmed;
  }

  private normalizeSelectors(options: {
    workspaceHint: string | null;
    workspaceHeader: string | null;
    workspacePathParam: string | null;
  }) {
    return [
      { value: options.workspacePathParam, source: 'path' as const },
      { value: options.workspaceHeader, source: 'header' as const },
      { value: options.workspaceHint, source: 'hint' as const },
    ].map((selector) => ({
      ...selector,
      normalized: this.normalizeWorkspaceSelector(selector.value, selector.source),
    }));
  }

  private async resolveWorkspaceContext(options: {
    userId: string;
    workspaceHint: string | null;
    workspaceHeader: string | null;
    workspacePathParam: string | null;
  }): Promise<WorkspaceResolution> {
    const baseScopes = new Set<PermissionScope>(GLOBAL_PERMISSION_SCOPES);

    if (!options.userId) {
      return {
        workspaceId: null,
        allowedWorkspaceIds: [],
        roles: [],
        scopes: [...baseScopes],
      };
    }

    const selectors = this.normalizeSelectors(options);
    const memberships = await this.findAllMemberships(options.userId);
    const allowedIds = memberships
      .map((m) => m.workspaceId)
      .filter((id): id is string => Boolean(id));

    for (const selector of selectors) {
      if (!selector.normalized) {
        continue;
      }

      const membership = await this.findWorkspaceMembership(options.userId, selector.normalized);
      if (membership) {
        return this.resolveWorkspaceFromMembership(membership, baseScopes, allowedIds);
      }

      if (selector.source !== 'hint') {
        throw new AuthorizationError('Workspace access denied');
      }
    }

    if (memberships.length === 0) {
      return {
        workspaceId: null,
        allowedWorkspaceIds: [],
        roles: [],
        scopes: [...baseScopes],
      };
    }

    if (memberships.length === 1) {
      const [onlyMembership] = memberships;
      if (onlyMembership) {
        return this.resolveWorkspaceFromMembership(onlyMembership, baseScopes, allowedIds);
      }
      throw new AuthorizationError('Workspace selection required');
    }

    throw new AuthorizationError('Workspace selection required');
  }

  private async findWorkspaceMembership(userId: string, workspaceId: string) {
    return this.membershipRepo.findFirst(userId, workspaceId);
  }

  private resolveWorkspaceFromMembership(
    membership: { workspaceId: string; role: string },
    baseScopes: Set<PermissionScope>,
    allowedWorkspaceIds?: string[]
  ): WorkspaceResolution {
    const normalizedRole = this.normalizeWorkspaceRole(membership.role);
    if (!normalizedRole) {
      throw new AuthorizationError('Workspace membership role is invalid');
    }

    const roles: WorkspaceRole[] = [normalizedRole];
    const scopes = new Set<PermissionScope>(baseScopes);
    for (const scope of deriveScopesFromRoles(roles)) {
      scopes.add(scope);
    }

    return {
      workspaceId: membership.workspaceId,
      allowedWorkspaceIds: allowedWorkspaceIds ?? [membership.workspaceId],
      roles,
      scopes: [...scopes],
    };
  }

  private async findAllMemberships(userId: string) {
    return this.membershipRepo.findManyByUserId(userId);
  }

  private normalizeWorkspaceRole(role: string | null): WorkspaceRole | null {
    if (!role) {
      return null;
    }
    const normalized = role.toLowerCase();
    if (isWorkspaceRole(normalized as WorkspaceRole)) {
      return normalized as WorkspaceRole;
    }
    const alias = WORKSPACE_ROLE_ALIASES[normalized];
    return alias ?? null;
  }
}

export type CreateAuthServiceOptions = {
  prisma?: PrismaClient;
  config?: AuthCoreEnvironment;
  keyStore?: SigningKeyStore;
  tokenService?: TokenService;
};

export async function createAuthService(
  options: CreateAuthServiceOptions = {}
): Promise<AuthCoreService> {
  let keyStore: SigningKeyStore;
  let resolvedConfig: AuthCoreEnvironment;

  if (options.keyStore && options.config) {
    keyStore = options.keyStore;
    resolvedConfig = options.config;
  } else if (options.keyStore) {
    resolvedConfig = loadAuthCoreConfig();
    keyStore = options.keyStore;
  } else if (options.config) {
    keyStore = await buildKeyStoreFromConfig(options.config);
    resolvedConfig = options.config;
  } else {
    const resources = await getDefaultSigningResources();
    keyStore = resources.keyStore;
    resolvedConfig = resources.config;
  }

  const prismaClient = options.prisma ?? prisma;

  return new AuthCoreService({
    prisma: prismaClient,
    userRepo: new PrismaAuthUserRepository(prismaClient),
    sessionRepo: new PrismaAuthSessionRepository(prismaClient),
    membershipRepo: new PrismaWorkspaceMembershipRepository(prismaClient),
    apiKeyRepo: new PrismaApiKeyRepository(prismaClient),
    profileRepo: new PrismaAuthProfileRepository(prismaClient),
    keyStore,
    issuer: resolvedConfig.issuer,
    audience: resolvedConfig.audience,
    clockToleranceSeconds: resolvedConfig.clockToleranceSeconds,
    tokenService:
      options.tokenService ??
      new TokenService({ repo: new PrismaRefreshTokenRepository(prismaClient) }),
  });
}

export async function generateAccessToken(params: SignAccessTokenParams) {
  const resources = await getDefaultSigningResources();
  return signAccessToken(resources.keyStore, resources.config, params);
}

export async function generateIdToken(params: SignIdTokenParams) {
  const resources = await getDefaultSigningResources();
  return signIdToken(resources.keyStore, resources.config, params);
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.valueOf());
}

function intersectScopes(
  allowedScopes: PermissionScope[],
  tokenScopes: PermissionScope[]
): PermissionScope[] {
  const allowed = new Set(allowedScopes);
  const granted = new Set<PermissionScope>();

  for (const scope of tokenScopes) {
    if (allowed.has(scope)) {
      granted.add(scope);
    }
  }

  return [...granted];
}
