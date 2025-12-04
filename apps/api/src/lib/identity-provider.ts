import { prisma } from '@repo/database';
import {
  LOCAL_PASSWORD_PROVIDER_ID,
  LOCAL_MAGIC_LINK_PROVIDER_ID,
  GOOGLE_PROVIDER_ID,
  verifyPassword,
} from '@repo/auth';
import type { VerifiedIdentity } from '@repo/auth-core';

export async function authenticatePasswordIdentity(email: string, password: string) {
  const normalizedEmail = email.toLowerCase().trim();

  const user = await prisma.user.findFirst({
    where: { primaryEmail: normalizedEmail, deletedAt: null },
    include: { password: true },
  });

  if (!user || !user.password?.passwordHash) {
    return null;
  }

  const isValid = await verifyPassword(password, user.password.passwordHash);
  if (!isValid) {
    return null;
  }

  const identity: VerifiedIdentity = {
    provider: LOCAL_PASSWORD_PROVIDER_ID,
    providerSubject: user.id,
    email: user.primaryEmail,
    emailVerified: !!user.emailVerified,
  };

  return { userId: user.id, identity };
}

export async function upsertMagicLinkIdentity(email: string) {
  const normalizedEmail = email.toLowerCase().trim();
  let user = await prisma.user.findFirst({
    where: { primaryEmail: normalizedEmail, deletedAt: null },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        primaryEmail: normalizedEmail,
        emailVerified: true,
        userState: 'active',
        profile: { create: { timezone: 'UTC', currency: 'USD' } },
      },
    });
  } else if (!user.emailVerified) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });
  }

  const identity: VerifiedIdentity = {
    provider: LOCAL_MAGIC_LINK_PROVIDER_ID,
    providerSubject: user.id,
    email: normalizedEmail,
    emailVerified: true,
  };

  return { userId: user.id, identity };
}

export type GoogleProfile = {
  providerSubject: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
};

export async function resolveGoogleIdentity(profile: GoogleProfile) {
  const normalizedEmail = profile.email.toLowerCase();

  const existingIdentity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: 'google',
        providerSubject: profile.providerSubject,
      },
    },
    include: { user: true },
  });

  if (existingIdentity) {
    return {
      userId: existingIdentity.user.id,
      identity: toVerifiedGoogleIdentity(profile),
    };
  }

  const existingUser = await prisma.user.findFirst({
    where: { primaryEmail: normalizedEmail, deletedAt: null },
  });

  if (existingUser) {
    await prisma.userIdentity.create({
      data: {
        userId: existingUser.id,
        provider: 'google',
        providerSubject: profile.providerSubject,
        emailAtProvider: profile.email,
        emailVerifiedAtProvider: profile.emailVerified,
        rawProfile: { name: profile.name, picture: profile.picture },
      },
    });
    return { userId: existingUser.id, identity: toVerifiedGoogleIdentity(profile) };
  }

  const created = await prisma.user.create({
    data: {
      primaryEmail: normalizedEmail,
      displayName: profile.name || null,
      emailVerified: profile.emailVerified,
      userState: 'active',
      identities: {
        create: {
          provider: 'google',
          providerSubject: profile.providerSubject,
          emailAtProvider: profile.email,
          emailVerifiedAtProvider: profile.emailVerified,
          rawProfile: { name: profile.name, picture: profile.picture },
        },
      },
      profile: { create: { timezone: 'UTC', currency: 'USD' } },
    },
  });

  return { userId: created.id, identity: toVerifiedGoogleIdentity(profile) };
}

function toVerifiedGoogleIdentity(profile: GoogleProfile): VerifiedIdentity {
  const identity: VerifiedIdentity = {
    provider: GOOGLE_PROVIDER_ID,
    providerSubject: profile.providerSubject,
    email: profile.email,
    emailVerified: profile.emailVerified,
  };

  if (profile.name) {
    identity.name = profile.name;
  }
  if (profile.picture) {
    identity.picture = profile.picture;
  }

  return identity;
}
