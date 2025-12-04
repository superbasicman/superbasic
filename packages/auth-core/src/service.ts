import {
  SESSION_MAX_AGE_SECONDS,
  createOpaqueToken,
  createTokenHashEnvelope,
  parseOpaqueToken,
  verifyTokenSecret,
} from '@repo/auth';
import {
  type IdentityProvider,
  Prisma,
  type PrismaClient,
  prisma,
  setPostgresContext,
} from '@repo/database';
import { jwtVerify } from 'jose';
import { GLOBAL_PERMISSION_SCOPES, deriveScopesFromRoles, isWorkspaceRole } from './authz.js';
import { type AuthCoreEnvironment, loadAuthCoreConfig } from './config.js';
import { AuthorizationError, InactiveUserError, UnauthorizedError } from './errors.js';
import type { AuthService } from './interfaces.js';
import { toJsonInput } from './json.js';
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
    this.keyStore = dependencies.keyStore;
    this.issuer = dependencies.issuer;
    this.audience = dependencies.audience;
    this.clockToleranceSeconds = dependencies.clockToleranceSeconds;
    this.setContext = dependencies.setContext ?? setPostgresContext;
    this.tokenService = dependencies.tokenService ?? new TokenService({ prisma: this.prisma });
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
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        userState: true,
        primaryEmail: true,
      },
    });

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

    const created = await this.prisma.$transaction(async (tx) => {
      await this.ensureIdentityLink(
        tx,
        {
          id: user.id,
          email: user.primaryEmail,
        },
        input.identity
      );

      // Per end-auth-goal.md: sessions don't have their own tokens
      // Refresh tokens are created separately and have the token/hash
      const session = await tx.authSession.create({
        data: {
          userId: user.id,
          expiresAt,
          lastActivityAt: now,
          mfaLevel: input.mfaLevel ?? 'none',
          ipAddress: input.ipAddress ?? null,
          clientInfo,
        },
      });

      return session;
    });

    if (this.onSessionCreated) {
      const createdClientInfo = (created.clientInfo ?? null) as {
        userAgent?: string | null;
      } | null;
      this.onSessionCreated({
        id: created.id,
        userId: created.userId,
        ipAddress: created.ipAddress,
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
      mfaLevel: created.mfaLevel,
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

    const created = await this.prisma.apiKey.create({
      data: {
        id: opaque.tokenId,
        userId: input.userId,
        name: input.name,
        keyHash: toJsonInput(envelope),
        last4: opaque.value.slice(-4),
        scopes: input.scopes,
        // No metadata field in ApiKey schema
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        expiresAt: input.expiresAt ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // Default 90 days
        revokedAt: null,
      },
    });

    return {
      tokenId: created.id,
      secret: opaque.value,
      type: 'personal_access', // Hardcoded for return type compatibility
      scopes: created.scopes as PermissionScope[],
      name: created.name ?? '',
      workspaceId: created.workspaceId,
      expiresAt: created.expiresAt,
    };
  }

  async revokeToken(input: RevokeTokenInput): Promise<void> {
    const token = await this.prisma.apiKey.findUnique({
      where: { id: input.tokenId },
      select: {
        id: true,
        revokedAt: true,
      },
    });

    if (!token) {
      throw new UnauthorizedError('Token not found');
    }

    if (token.revokedAt) {
      return;
    }

    const now = new Date();
    await this.prisma.apiKey.update({
      where: { id: input.tokenId },
      data: {
        revokedAt: now,
      },
    });
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
    const user = await this.prisma.user.findUnique({
      where: { id: options.userId },
      select: {
        id: true,
        userState: true,
        profile: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.userState !== 'active') {
      throw new InactiveUserError();
    }

    const profileId = user.profile?.id ?? null;

    const session = options.sessionId
      ? await this.prisma.authSession.findUnique({
          where: { id: options.sessionId },
          select: {
            id: true,
            userId: true,
            expiresAt: true,
            revokedAt: true,
            mfaLevel: true,
            lastActivityAt: true,
            clientInfo: true,
          },
        })
      : null;

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
    const mfaLevel = session?.mfaLevel ?? 'none';

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
    const token = await this.prisma.apiKey.findUnique({
      where: { id: options.tokenId },
      select: {
        id: true,
        userId: true,
        name: true,
        keyHash: true,
        last4: true,
        scopes: true,
        // No metadata field in ApiKey schema
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        lastUsedAt: true,
        workspaceId: true,
        user: {
          select: {
            id: true,
            userState: true,
            profile: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

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

    const profileId = token.user.profile?.id ?? null;
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
    return this.prisma.workspaceMember.findFirst({
      where: {
        userId,
        workspaceId,
        workspace: {
          deletedAt: null,
        },
      },
      select: {
        workspaceId: true,
        role: true,
      },
    });
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
    return this.prisma.workspaceMember.findMany({
      where: {
        userId,
        revokedAt: null,
        workspace: { deletedAt: null },
      },
      select: {
        workspaceId: true,
        role: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
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

  private async ensureIdentityLink(
    tx: Pick<PrismaClient, 'user' | 'userIdentity'>,
    user: { id: string; email: string | null },
    identity: CreateSessionInput['identity']
  ) {
    if (!identity.provider || !identity.providerSubject) {
      return;
    }

    try {
      const normalizedEmail = identity.email?.trim() ?? null;

      const existing = await tx.userIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: identity.provider as IdentityProvider,
            providerSubject: identity.providerSubject,
          },
        },
      });

      if (existing && existing.userId !== user.id) {
        throw new UnauthorizedError('Identity is linked to another user');
      }

      if (existing) {
        const metadataUpdate: { metadata: Prisma.InputJsonValue } | undefined =
          identity.rawClaims !== undefined
            ? { metadata: toJsonInput(identity.rawClaims) }
            : undefined;
        await tx.userIdentity.update({
          where: { id: existing.id },
          data: {
            emailAtProvider: normalizedEmail ?? existing.emailAtProvider,
            emailVerifiedAtProvider:
              typeof identity.emailVerified === 'boolean'
                ? identity.emailVerified
                : existing.emailVerifiedAtProvider,
            ...(metadataUpdate ?? {}),
          },
        });
      } else {
        const metadataCreate: { metadata: Prisma.InputJsonValue } | undefined =
          identity.rawClaims !== undefined
            ? { metadata: toJsonInput(identity.rawClaims) }
            : undefined;
        await tx.userIdentity.create({
          data: {
            userId: user.id,
            provider: identity.provider as IdentityProvider,
            providerSubject: identity.providerSubject,
            emailAtProvider: normalizedEmail,
            emailVerifiedAtProvider: identity.emailVerified ?? false,
            ...(metadataCreate ?? {}),
          },
        });
      }

      if (identity.email && identity.emailVerified) {
        const normalized = identity.email.trim().toLowerCase();
        if (!user.email || user.email.toLowerCase() !== normalized) {
          const conflicting = await tx.user.findFirst({
            where: {
              primaryEmail: normalized,
              NOT: { id: user.id },
            },
          });
          if (!conflicting) {
            await tx.user.update({
              where: { id: user.id },
              data: {
                // email: identity.email.trim(), // Don't update user email from identity automatically
                // emailLower: normalized,
              },
            });
          }
        }
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        return;
      }
      throw error;
    }
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

  return new AuthCoreService({
    prisma: options.prisma ?? prisma,
    keyStore,
    issuer: resolvedConfig.issuer,
    audience: resolvedConfig.audience,
    clockToleranceSeconds: resolvedConfig.clockToleranceSeconds,
    tokenService: options.tokenService ?? new TokenService({ prisma: options.prisma ?? prisma }),
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
