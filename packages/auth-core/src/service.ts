import {
  SESSION_ABSOLUTE_MAX_AGE_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  createOpaqueToken,
  createTokenHashEnvelope,
} from '@repo/auth';
import { Prisma, type PrismaClient, prisma, setPostgresContext } from '@repo/database';
import { jwtVerify } from 'jose';
import { GLOBAL_PERMISSION_SCOPES, deriveScopesFromRoles, isWorkspaceRole } from './authz.js';
import { type AuthCoreEnvironment, loadAuthCoreConfig } from './config.js';
import { AuthorizationError, InactiveUserError, UnauthorizedError } from './errors.js';
import type { AuthService } from './interfaces.js';
import { toJsonInput } from './json.js';
import {
  type SignAccessTokenParams,
  SigningKeyStore,
  buildSigningKey,
  buildVerificationKey,
  signAccessToken,
} from './signing.js';
import type {
  AccessTokenClaims,
  AuthContext,
  ClientType,
  CreateSessionInput,
  IssuePersonalAccessTokenInput,
  IssuedToken,
  PermissionScope,
  RevokeSessionInput,
  RevokeTokenInput,
  SessionHandle,
  VerifyRequestInput,
  WorkspaceRole,
} from './types.js';

type AuthCoreServiceDependencies = {
  prisma: PrismaClient;
  keyStore: SigningKeyStore;
  issuer: string;
  audience: string;
  clockToleranceSeconds: number;
  setContext?: typeof setPostgresContext;
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

  constructor(dependencies: AuthCoreServiceDependencies) {
    this.prisma = dependencies.prisma;
    this.keyStore = dependencies.keyStore;
    this.issuer = dependencies.issuer;
    this.audience = dependencies.audience;
    this.clockToleranceSeconds = dependencies.clockToleranceSeconds;
    this.setContext = dependencies.setContext ?? setPostgresContext;
  }

  async verifyRequest(input: VerifyRequestInput): Promise<AuthContext | null> {
    const token = extractBearer(input.authorizationHeader);
    if (!token) {
      return null;
    }

    const verification = await this.verifyJwt(token);
    const payload = verification.payload as AccessTokenClaims;

    if (!payload.sub) {
      throw new UnauthorizedError('Access token missing subject');
    }

    if (payload.token_use !== 'access') {
      throw new UnauthorizedError('Unsupported token type');
    }

    const sessionId =
      typeof payload.sid === 'string' && payload.sid.length > 0 ? payload.sid : null;
    const workspaceHint =
      typeof payload.wid === 'string' && payload.wid.length > 0 ? payload.wid : null;
    const recentlyAuthenticatedAt =
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
      recentlyAuthenticatedAt,
    });
  }

  async createSession(input: CreateSessionInput): Promise<SessionHandle> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        status: true,
        email: true,
        emailLower: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.status !== 'active') {
      throw new InactiveUserError();
    }

    const clientType = normalizeClientType(input.clientType);
    const now = new Date();
    const slidingWindowSeconds = input.rememberMe ? SESSION_MAX_AGE_SECONDS : 7 * 24 * 60 * 60;
    const absoluteWindow = SESSION_ABSOLUTE_MAX_AGE_SECONDS;
    const computedExpiresAt = new Date(now.getTime() + slidingWindowSeconds * 1000);
    const absoluteExpiresAt = new Date(now.getTime() + absoluteWindow * 1000);
    const expiresAt =
      computedExpiresAt.getTime() > absoluteExpiresAt.getTime()
        ? absoluteExpiresAt
        : computedExpiresAt;

    const created = await this.prisma.$transaction(async (tx) => {
      await this.ensureIdentityLink(
        tx,
        {
          id: user.id,
          email: user.email,
          emailLower: user.emailLower,
        },
        input.identity
      );

      const opaque = createOpaqueToken();
      const sessionTokenHash = createTokenHashEnvelope(opaque.tokenSecret);

      const session = await tx.session.create({
        data: {
          userId: user.id,
          tokenId: opaque.tokenId,
          sessionTokenHash,
          expiresAt,
          absoluteExpiresAt,
          clientType,
          kind: input.rememberMe ? 'persistent' : 'default',
          lastUsedAt: now,
          mfaLevel: input.mfaLevel ?? 'none',
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        },
      });

      return session;
    });

    return {
      sessionId: created.id,
      userId: created.userId,
      clientType,
      activeWorkspaceId: input.workspaceId ?? null,
      createdAt: created.createdAt,
      expiresAt: created.expiresAt,
      absoluteExpiresAt: created.absoluteExpiresAt,
      mfaLevel: created.mfaLevel,
    };
  }

  async revokeSession(_input: RevokeSessionInput): Promise<void> {
    throw new Error('AuthCoreService.revokeSession is not implemented yet.');
  }

  async issuePersonalAccessToken(_input: IssuePersonalAccessTokenInput): Promise<IssuedToken> {
    throw new Error('AuthCoreService.issuePersonalAccessToken is not implemented yet.');
  }

  async revokeToken(_input: RevokeTokenInput): Promise<void> {
    throw new Error('AuthCoreService.revokeToken is not implemented yet.');
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
    recentlyAuthenticatedAt?: Date | null;
  }): Promise<AuthContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: options.userId },
      select: {
        id: true,
        status: true,
        profile: {
          select: { id: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.status !== 'active') {
      throw new InactiveUserError();
    }

    const profileId = user.profile?.id ?? null;

    const session = options.sessionId
      ? await this.prisma.session.findUnique({
          where: { id: options.sessionId },
          select: {
            id: true,
            userId: true,
            clientType: true,
            expiresAt: true,
            absoluteExpiresAt: true,
            revokedAt: true,
            mfaLevel: true,
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

      if (session.absoluteExpiresAt && session.absoluteExpiresAt < now) {
        throw new UnauthorizedError('Session lifetime exceeded');
      }
    }

    const clientType = normalizeClientType(session?.clientType ?? options.clientTypeClaim);
    const mfaLevel = session?.mfaLevel ?? 'none';

    const workspaceResolution = await this.resolveWorkspaceContext({
      profileId,
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

    const authContext: AuthContext = {
      userId: user.id,
      sessionId: session?.id ?? null,
      clientType,
      activeWorkspaceId: workspaceResolution.workspaceId,
      scopes: workspaceResolution.scopes,
      roles: workspaceResolution.roles,
      profileId,
      mfaLevel,
      recentlyAuthenticatedAt: options.recentlyAuthenticatedAt ?? null,
    };

    if (options.requestId) {
      authContext.requestId = options.requestId;
    }

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

  private async resolveWorkspaceContext(options: {
    profileId: string | null;
    workspaceHint: string | null;
    workspaceHeader: string | null;
    workspacePathParam: string | null;
  }): Promise<WorkspaceResolution> {
    const baseScopes = new Set<PermissionScope>(GLOBAL_PERMISSION_SCOPES);

    if (!options.profileId) {
      return {
        workspaceId: null,
        roles: [],
        scopes: [...baseScopes],
      };
    }

    const selectors: { value: string | null; source: WorkspaceSelectorSource }[] = [
      { value: options.workspacePathParam, source: 'path' },
      { value: options.workspaceHeader, source: 'header' },
      { value: options.workspaceHint, source: 'hint' },
    ];

    for (const selector of selectors) {
      const normalized = this.normalizeWorkspaceSelector(selector.value, selector.source);
      if (!normalized) {
        continue;
      }

      const membership = await this.findWorkspaceMembership(options.profileId, normalized);
      if (membership) {
        return this.resolveWorkspaceFromMembership(membership, baseScopes);
      }

      if (selector.source !== 'hint') {
        throw new AuthorizationError('Workspace access denied');
      }
    }

    const fallbackMembership = await this.findDefaultWorkspaceMembership(options.profileId);
    if (fallbackMembership) {
      return this.resolveWorkspaceFromMembership(fallbackMembership, baseScopes);
    }

    return {
      workspaceId: null,
      roles: [],
      scopes: [...baseScopes],
    };
  }

  private async findWorkspaceMembership(profileId: string, workspaceId: string) {
    return this.prisma.workspaceMember.findFirst({
      where: {
        memberProfileId: profileId,
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

  private async findDefaultWorkspaceMembership(profileId: string) {
    return this.prisma.workspaceMember.findFirst({
      where: {
        memberProfileId: profileId,
        workspace: {
          deletedAt: null,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        workspaceId: true,
        role: true,
      },
    });
  }

  private resolveWorkspaceFromMembership(
    membership: { workspaceId: string; role: string },
    baseScopes: Set<PermissionScope>
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
      roles,
      scopes: [...scopes],
    };
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
    user: { id: string; email: string | null; emailLower: string | null },
    identity: CreateSessionInput['identity']
  ) {
    if (!identity.provider || !identity.providerUserId) {
      return;
    }

    try {
      const normalizedEmail = identity.email?.trim() ?? null;

      const existing = await tx.userIdentity.findUnique({
        where: {
          provider_providerUserId: {
            provider: identity.provider,
            providerUserId: identity.providerUserId,
          },
        },
      });

      if (existing && existing.userId !== user.id) {
        throw new UnauthorizedError('Identity is linked to another user');
      }

      if (existing) {
        const metadataUpdate: { metadata: Prisma.InputJsonValue } | undefined =
          identity.metadata !== undefined
            ? { metadata: toJsonInput(identity.metadata) }
            : undefined;
        await tx.userIdentity.update({
          where: { id: existing.id },
          data: {
            email: normalizedEmail ?? existing.email,
            emailVerified:
              typeof identity.emailVerified === 'boolean'
                ? identity.emailVerified
                : existing.emailVerified,
            ...(metadataUpdate ?? {}),
          },
        });
      } else {
        const metadataCreate: { metadata: Prisma.InputJsonValue } | undefined =
          identity.metadata !== undefined
            ? { metadata: toJsonInput(identity.metadata) }
            : undefined;
        await tx.userIdentity.create({
          data: {
            userId: user.id,
            provider: identity.provider,
            providerUserId: identity.providerUserId,
            email: normalizedEmail,
            emailVerified:
              typeof identity.emailVerified === 'boolean' ? identity.emailVerified : null,
            ...(metadataCreate ?? {}),
          },
        });
      }

      if (identity.email && identity.emailVerified) {
        const normalized = identity.email.trim().toLowerCase();
        if (!user.emailLower || user.emailLower !== normalized) {
          const conflicting = await tx.user.findFirst({
            where: {
              emailLower: normalized,
              NOT: { id: user.id },
            },
          });
          if (!conflicting) {
            await tx.user.update({
              where: { id: user.id },
              data: {
                email: identity.email.trim(),
                emailLower: normalized,
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
  });
}

export async function generateAccessToken(params: SignAccessTokenParams) {
  const resources = await getDefaultSigningResources();
  return signAccessToken(resources.keyStore, resources.config, params);
}
