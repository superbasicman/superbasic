import {
  SESSION_ABSOLUTE_MAX_AGE_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  createOpaqueToken,
  createTokenHashEnvelope,
} from '@repo/auth';
import { Prisma, type PrismaClient, prisma, setPostgresContext } from '@repo/database';
import { jwtVerify } from 'jose';
import { type AuthCoreEnvironment, loadAuthCoreConfig } from './config.js';
import { InactiveUserError, UnauthorizedError } from './errors.js';
import type { AuthService } from './interfaces.js';
import { toJsonInput } from './json.js';
import {
  type SignAccessTokenParams,
  SigningKeyStore,
  buildSigningKey,
  signAccessToken,
} from './signing.js';
import type {
  AccessTokenClaims,
  AuthContext,
  ClientType,
  CreateSessionInput,
  IssuePersonalAccessTokenInput,
  IssuedToken,
  RevokeSessionInput,
  RevokeTokenInput,
  SessionHandle,
  VerifyRequestInput,
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

async function getDefaultSigningResources(): Promise<SigningResources> {
  if (!signingResourcesPromise) {
    signingResourcesPromise = (async () => {
      const config = loadAuthCoreConfig();
      const signingKey = await buildSigningKey(config);
      return {
        config,
        keyStore: new SigningKeyStore([signingKey], config.keyId),
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
    const workspaceId =
      typeof payload.wid === 'string' && payload.wid.length > 0 ? payload.wid : null;

    return this.buildAuthContext({
      userId: payload.sub,
      sessionId,
      workspaceId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(payload.client_type ? { clientTypeClaim: payload.client_type } : {}),
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
    workspaceId: string | null;
    requestId?: string;
    clientTypeClaim?: string | ClientType;
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

    await this.setContext(this.prisma, {
      userId: user.id,
      profileId,
      workspaceId: options.workspaceId ?? null,
    });

    const authContext: AuthContext = {
      userId: user.id,
      sessionId: session?.id ?? null,
      clientType,
      activeWorkspaceId: options.workspaceId ?? null,
      scopes: [],
      roles: [],
      profileId,
      mfaLevel: session?.mfaLevel ?? 'none',
    };

    if (options.requestId) {
      authContext.requestId = options.requestId;
    }

    return authContext;
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
    const signingKey = await buildSigningKey(options.config);
    keyStore = new SigningKeyStore([signingKey], options.config.keyId);
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
