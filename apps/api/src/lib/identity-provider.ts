import {
  LOCAL_PASSWORD_PROVIDER_ID,
  LOCAL_MAGIC_LINK_PROVIDER_ID,
  GOOGLE_PROVIDER_ID,
  verifyPassword,
} from '@repo/auth';
import type { VerifiedIdentity } from '@repo/auth-core';
import {
  identityRepository,
  securityEventRepository,
  userRepository,
} from '../services/index.js';

export async function authenticatePasswordIdentity(email: string, password: string) {
  const normalizedEmail = email.toLowerCase().trim();

  const user = await userRepository.findByEmailWithPassword(normalizedEmail);

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
  let user = await userRepository.findByEmail(normalizedEmail);

  if (!user) {
    // Check cooling-off period to prevent claiming recently unlinked emails
    const recentUnlink = await checkEmailCoolingOff(normalizedEmail);
    if (recentUnlink) {
      throw new Error(
        'This email was recently unlinked from another account. Please wait before using it again.'
      );
    }

    user = await userRepository.createUserWithProfileOnly({
      email: normalizedEmail,
      emailVerified: true,
      timezone: 'UTC',
      currency: 'USD',
    });
  } else if (!user.emailVerified) {
    await userRepository.verifyEmail(user.id);
    user = { ...user, emailVerified: true };
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

  const existingIdentity = await identityRepository.findByProviderSubject(
    'google',
    profile.providerSubject
  );

  if (existingIdentity) {
    return {
      userId: existingIdentity.user.id,
      identity: toVerifiedGoogleIdentity(profile),
    };
  }

  const existingUser = await userRepository.findByEmail(normalizedEmail);

  if (existingUser) {
    // Check cooling-off period to prevent immediate relinking after unlink
    const recentUnlink = await checkEmailCoolingOff(normalizedEmail);
    if (recentUnlink) {
      throw new Error(
        'This email was recently unlinked from another account. Please wait before linking it again.'
      );
    }

    await identityRepository.create({
      userId: existingUser.id,
      provider: 'google',
      providerSubject: profile.providerSubject,
      emailAtProvider: profile.email,
      emailVerifiedAtProvider: profile.emailVerified,
      rawProfile: { name: profile.name, picture: profile.picture },
    });
    return { userId: existingUser.id, identity: toVerifiedGoogleIdentity(profile) };
  }

  const created = await userRepository.createUserWithProfileOnly({
    email: normalizedEmail,
    displayName: profile.name ?? null,
    emailVerified: profile.emailVerified,
    timezone: 'UTC',
    currency: 'USD',
  });
  await identityRepository.create({
    userId: created.id,
    provider: 'google',
    providerSubject: profile.providerSubject,
    emailAtProvider: profile.email,
    emailVerifiedAtProvider: profile.emailVerified,
    rawProfile: { name: profile.name, picture: profile.picture },
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

/**
 * Check if an email was recently unlinked from another account.
 * Returns true if the email is within the cooling-off period.
 * 
 * Cooling-off period: 7 days
 * Purpose: Prevents attackers from immediately claiming an email after
 * tricking a user into unlinking it.
 */
async function checkEmailCoolingOff(email: string): Promise<boolean> {
  const COOLING_OFF_DAYS = 7;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - COOLING_OFF_DAYS);

  const recentUnlink = await securityEventRepository.findRecentIdentityUnlink(email, cutoff);

  return !!recentUnlink;
}
