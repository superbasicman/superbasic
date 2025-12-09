import { Prisma } from '@repo/database';
import type { PrismaClient, UserIdentity, IdentityProvider } from '@repo/database';

export type CreateIdentityParams = {
  userId: string;
  provider: IdentityProvider;
  providerSubject: string;
  emailAtProvider?: string;
  emailVerifiedAtProvider?: boolean;
  rawProfile?: Prisma.InputJsonValue;
};

export class IdentityRepository {
  constructor(private prisma: PrismaClient) {}

  async findByProviderSubject(provider: IdentityProvider, providerSubject: string): Promise<(UserIdentity & { user: { id: string; primaryEmail: string | null; emailVerified: boolean | null } }) | null> {
    return this.prisma.userIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider,
          providerSubject,
        },
      },
      include: {
        user: true,
      },
    }) as Promise<
      (UserIdentity & {
        user: { id: string; primaryEmail: string | null; emailVerified: boolean | null };
      }) | null
    >;
  }

  async findByProviderAndSubject(
    provider: IdentityProvider | string,
    providerSubject: string
  ): Promise<Array<{ userId: string; provider: IdentityProvider; providerSubject: string }>> {
    return this.prisma.userIdentity.findMany({
      where: {
        provider: provider as IdentityProvider,
        providerSubject,
      },
      select: {
        userId: true,
        provider: true,
        providerSubject: true,
      },
    });
  }

  async create(params: CreateIdentityParams): Promise<UserIdentity> {
    return this.prisma.userIdentity.create({
      data: {
        userId: params.userId,
        provider: params.provider,
        providerSubject: params.providerSubject,
        emailAtProvider: params.emailAtProvider ?? null,
        emailVerifiedAtProvider: params.emailVerifiedAtProvider ?? false,
        rawProfile: params.rawProfile ?? Prisma.DbNull,
      },
    });
  }
}
