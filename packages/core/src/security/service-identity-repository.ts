import type {
  PrismaClient,
  PrismaClientOrTransaction,
  ServiceIdentity,
  ClientSecret,
} from '@repo/database';

export type ServiceIdentityWithSecret = ServiceIdentity & {
  clientSecrets: ClientSecret[];
};

export class ServiceIdentityRepository {
  constructor(private prisma: PrismaClient) {}

  private getClient(client?: PrismaClientOrTransaction): PrismaClientOrTransaction {
    return client ?? this.prisma;
  }

  async findActiveWithLatestSecret(
    clientId: string,
    client?: PrismaClientOrTransaction
  ): Promise<ServiceIdentityWithSecret | null> {
    const db = this.getClient(client);
    const record = await db.serviceIdentity.findUnique({
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
    if (!record || record.disabledAt) {
      return null;
    }
    return record as ServiceIdentityWithSecret;
  }
}
