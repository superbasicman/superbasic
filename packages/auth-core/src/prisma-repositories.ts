import { Prisma } from '@repo/database';
import type {
  IdentityProvider,
  MfaLevel,
  PrismaClient,
  RefreshToken as PrismaRefreshToken,
} from '@repo/database';
import { UnauthorizedError } from './errors.js';
import type {
  ApiKeyRepository,
  AuthProfileRepository,
  AuthSessionRepository,
  AuthUserRepository,
  OAuthClientRepository,
  RefreshTokenRepository,
  WorkspaceMembershipRepository,
} from './interfaces.js';
import { toJsonInput } from './json.js';
import type { OAuthClientRecord, RefreshTokenRecord, TokenHashEnvelope } from './types.js';

export class PrismaOAuthClientRepository implements OAuthClientRepository {
  constructor(private prisma: Pick<PrismaClient, 'oAuthClient' | 'serviceIdentity'>) {}

  async findByClientId(clientId: string): Promise<OAuthClientRecord | null> {
    const record = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
      select: {
        id: true,
        clientId: true,
        clientType: true,
        redirectUris: true,
        tokenEndpointAuthMethod: true,
        isFirstParty: true,
        disabledAt: true,
      },
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      clientId: record.clientId,
      type: record.clientType,
      redirectUris: record.redirectUris,
      tokenEndpointAuthMethod: record.tokenEndpointAuthMethod,
      isFirstParty: record.isFirstParty,
      disabledAt: record.disabledAt,
    };
  }

  async findClientSecret(clientId: string): Promise<TokenHashEnvelope | null> {
    const serviceIdentity = await this.prisma.serviceIdentity.findUnique({
      where: { clientId },
      include: {
        clientSecrets: {
          where: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!serviceIdentity || serviceIdentity.disabledAt) {
      return null;
    }

    const [clientSecretRecord] = serviceIdentity.clientSecrets;
    if (!clientSecretRecord) {
      return null;
    }

    return clientSecretRecord.secretHash as TokenHashEnvelope;
  }
}

export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private prisma: Pick<PrismaClient, 'refreshToken'>) {}

  async create(data: {
    id: string;
    userId: string;
    sessionId: string;
    hashEnvelope: TokenHashEnvelope;
    scopes: string[];
    familyId: string;
    last4: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord> {
    const created = await this.prisma.refreshToken.create({
      data: {
        id: data.id,
        userId: data.userId,
        sessionId: data.sessionId,
        hashEnvelope: toJsonInput(data.hashEnvelope),
        scopes: data.scopes,
        familyId: data.familyId,
        last4: data.last4,
        expiresAt: data.expiresAt,
        revokedAt: null,
      },
    });
    return mapRefreshToken(created);
  }
}

export class PrismaAuthUserRepository implements AuthUserRepository {
  constructor(private prisma: Pick<PrismaClient, 'user'>) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        userState: true,
        primaryEmail: true,
        profile: { select: { id: true } },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      userState: user.userState,
      primaryEmail: user.primaryEmail,
      profileId: user.profile?.id ?? null,
    };
  }
}

export class PrismaAuthSessionRepository implements AuthSessionRepository {
  constructor(private prisma: PrismaClient) {}

  async create(
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
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (identity) {
        // Cast tx to PrismaClient to match ensureIdentityLink signature
        // In reality, transaction client has a subset of PrismaClient methods, but for our usage it's compatible
        await this.ensureIdentityLink(tx as unknown as PrismaClient, data.userId, identity);
      }

      const session = await tx.authSession.create({
        data: {
          userId: data.userId,
          expiresAt: data.expiresAt,
          lastActivityAt: data.lastActivityAt,
          mfaLevel: data.mfaLevel as MfaLevel,
          ipAddress: data.ipAddress ?? null,
          clientInfo: toJsonInput(data.clientInfo as Record<string, unknown>),
        },
      });

      return {
        id: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt,
        mfaLevel: session.mfaLevel,
        ipAddress: session.ipAddress,
        clientInfo: session.clientInfo,
        createdAt: session.createdAt,
      };
    });
  }

  async findById(id: string) {
    const session = await this.prisma.authSession.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
        mfaLevel: true,
        lastActivityAt: true,
        clientInfo: true,
      },
    });
    if (!session) {
      return null;
    }
    return {
      ...session,
      mfaLevel: session.mfaLevel as string,
    };
  }

  private async ensureIdentityLink(
    tx: PrismaClient,
    userId: string,
    identity: {
      provider: string;
      providerSubject: string;
      email?: string | null;
      emailVerified?: boolean | null;
      rawClaims?: unknown;
    }
  ) {
    if (!identity.provider || !identity.providerSubject) {
      return;
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, primaryEmail: true },
    });
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

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
      await tx.userIdentity.update({
        where: { id: existing.id },
        data: {
          emailAtProvider: normalizedEmail ?? existing.emailAtProvider,
          emailVerifiedAtProvider:
            typeof identity.emailVerified === 'boolean'
              ? identity.emailVerified
              : existing.emailVerifiedAtProvider,
          rawProfile: identity.rawClaims
            ? toJsonInput(identity.rawClaims as Record<string, unknown>)
            : Prisma.DbNull,
        },
      });
    } else {
      await tx.userIdentity.create({
        data: {
          userId: user.id,
          provider: identity.provider as IdentityProvider,
          providerSubject: identity.providerSubject,
          emailAtProvider: normalizedEmail,
          emailVerifiedAtProvider: identity.emailVerified ?? false,
          rawProfile: identity.rawClaims
            ? toJsonInput(identity.rawClaims as Record<string, unknown>)
            : Prisma.DbNull,
        },
      });
    }

    if (identity.email && identity.emailVerified) {
      const normalized = identity.email.trim().toLowerCase();
      if (!user.primaryEmail || user.primaryEmail.toLowerCase() !== normalized) {
        // Logic intentionally left blank per original service
      }
    }
  }
}

export class PrismaWorkspaceMembershipRepository implements WorkspaceMembershipRepository {
  constructor(private prisma: Pick<PrismaClient, 'workspaceMember'>) {}

  async findManyByUserId(userId: string) {
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

  async findFirst(userId: string, workspaceId: string) {
    return this.prisma.workspaceMember.findFirst({
      where: {
        userId,
        workspaceId,
        workspace: { deletedAt: null },
      },
      select: {
        workspaceId: true,
        role: true,
      },
    });
  }
}

export class PrismaApiKeyRepository implements ApiKeyRepository {
  constructor(private prisma: Pick<PrismaClient, 'apiKey'>) {}

  async create(data: {
    id: string;
    userId: string;
    workspaceId?: string | null;
    keyHash: TokenHashEnvelope;
    scopes: string[];
    name: string;
    last4: string;
    expiresAt: Date;
  }) {
    const created = await this.prisma.apiKey.create({
      data: {
        id: data.id,
        userId: data.userId,
        name: data.name,
        keyHash: toJsonInput(data.keyHash),
        last4: data.last4,
        scopes: data.scopes,
        workspaceId: data.workspaceId ?? null,
        expiresAt: data.expiresAt,
        revokedAt: null,
      },
    });

    return {
      id: created.id,
      userId: created.userId,
      scopes: created.scopes,
      name: created.name,
      workspaceId: created.workspaceId,
      expiresAt: created.expiresAt,
    };
  }

  async findById(id: string) {
    const key = await this.prisma.apiKey.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        name: true,
        keyHash: true,
        last4: true,
        scopes: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        workspaceId: true,
        user: {
          select: {
            id: true,
            userState: true,
            profile: { select: { id: true } },
          },
        },
      },
    });

    if (!key) {
      return null;
    }

    return {
      ...key,
      keyHash: key.keyHash as TokenHashEnvelope,
      scopes: key.scopes,
      user: {
        id: key.user.id,
        userState: key.user.userState,
        profileId: key.user.profile?.id ?? null,
      },
    };
  }

  async revoke(id: string) {
    await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }
}

export class PrismaAuthProfileRepository implements AuthProfileRepository {
  constructor(private prisma: Pick<PrismaClient, 'profile'>) {}

  async ensureExists(userId: string) {
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (existing) {
      return existing.id;
    }

    const created = await this.prisma.profile.create({
      data: {
        userId,
        timezone: 'UTC',
        currency: 'USD',
      },
      select: { id: true },
    });

    return created.id;
  }
}

function mapRefreshToken(record: PrismaRefreshToken): RefreshTokenRecord {
  return {
    id: record.id,
    userId: record.userId,
    sessionId: record.sessionId,
    workspaceId: null,
    type: 'refresh',
    tokenHash: record.hashEnvelope as TokenHashEnvelope,
    scopes: (record.scopes ?? []) as string[],
    name: null,
    familyId: record.familyId ?? null,
    metadata: null,
    lastUsedAt: record.lastUsedAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
