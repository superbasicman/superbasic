import { type PrismaClient, prisma, setPostgresContext } from '@repo/database';
import { jwtVerify } from 'jose';
import { type AuthCoreEnvironment, loadAuthCoreConfig } from './config.js';
import { InactiveUserError, UnauthorizedError } from './errors.js';
import type { AuthService } from './interfaces.js';
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

  async createSession(_input: CreateSessionInput): Promise<SessionHandle> {
    throw new Error('AuthCoreService.createSession is not implemented yet.');
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
