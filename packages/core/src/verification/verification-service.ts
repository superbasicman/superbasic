/**
 * Verification Service
 *
 * Business logic layer for email verification
 * Handles token creation, verification, and resend flows
 */

import {
  createOpaqueToken,
  createTokenHashEnvelope,
  parseOpaqueToken,
  verifyTokenSecret,
} from '@repo/auth-core';
import type { VerificationRepository } from './verification-repository.js';
import {
  TokenExpiredError,
  TokenInvalidError,
  TokenAlreadyConsumedError,
  UserNotFoundForVerificationError,
  EmailAlreadyVerifiedError,
} from './verification-errors.js';
import type {
  CreateVerificationTokenParams,
  CreateVerificationTokenResult,
  VerifyEmailTokenParams,
  VerifyEmailTokenResult,
  ResendVerificationParams,
} from './verification-types.js';

const EMAIL_VERIFICATION_PREFIX = 'ev';
const DEFAULT_EXPIRY_HOURS = 24;

interface AuthEvents {
  emit(event: { type: string; [key: string]: unknown }): void;
}

export class VerificationService {
  constructor(
    private verificationRepo: VerificationRepository,
    private authEvents: AuthEvents,
    private userRepo: {
      findByEmail: (email: string) => Promise<{ id: string; emailVerified: boolean } | null>;
      markEmailVerified: (userId: string) => Promise<void>;
    }
  ) {}

  /**
   * Create an email verification token
   * Generates an opaque token with ev_ prefix and stores hash envelope
   */
  async createEmailVerificationToken(
    params: CreateVerificationTokenParams
  ): Promise<CreateVerificationTokenResult> {
    const normalizedEmail = params.email.toLowerCase().trim();
    const expiresInHours = params.expiresInHours ?? DEFAULT_EXPIRY_HOURS;

    // Generate opaque token with ev_ prefix
    const opaque = createOpaqueToken({ prefix: EMAIL_VERIFICATION_PREFIX });
    const hashEnvelope = createTokenHashEnvelope(opaque.tokenSecret);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    // Store token
    await this.verificationRepo.create({
      identifier: normalizedEmail,
      tokenId: opaque.tokenId,
      hashEnvelope,
      type: params.type,
      expiresAt,
    });

    // Emit audit event
    this.authEvents.emit({
      type: 'verification.token_created',
      email: normalizedEmail,
      tokenType: params.type,
      expiresAt: expiresAt.toISOString(),
      ip: params.requestContext?.ip,
      timestamp: new Date(),
    });

    return {
      tokenValue: opaque.value,
      expiresAt,
    };
  }

  /**
   * Verify an email verification token
   * Validates the token, marks user email as verified, and marks token as consumed
   */
  async verifyEmailToken(
    params: VerifyEmailTokenParams
  ): Promise<VerifyEmailTokenResult> {
    // Parse the opaque token
    const parsed = parseOpaqueToken(params.token, {
      expectedPrefix: EMAIL_VERIFICATION_PREFIX,
    });

    if (!parsed) {
      throw new TokenInvalidError();
    }

    // Find token by tokenId
    const tokenRecord = await this.verificationRepo.findByTokenId(
      parsed.tokenId
    );

    if (!tokenRecord) {
      throw new TokenInvalidError();
    }

    // Verify token type matches expected type
    if (tokenRecord.type !== 'email_verification') {
      throw new TokenInvalidError();
    }

    // Check if already consumed
    if (tokenRecord.consumedAt) {
      throw new TokenAlreadyConsumedError();
    }

    // Check expiration
    if (tokenRecord.expiresAt < new Date()) {
      throw new TokenExpiredError();
    }

    // Verify the secret against hash envelope
    const isValid = verifyTokenSecret(
      parsed.tokenSecret,
      tokenRecord.hashEnvelope
    );

    if (!isValid) {
      throw new TokenInvalidError();
    }

    // Find user by email
    const user = await this.userRepo.findByEmail(tokenRecord.identifier);

    if (!user) {
      throw new UserNotFoundForVerificationError();
    }

    // Check if already verified
    if (user.emailVerified) {
      throw new EmailAlreadyVerifiedError();
    }

    // Transaction: mark token consumed and user verified
    await this.verificationRepo.markConsumed(tokenRecord.id);
    await this.userRepo.markEmailVerified(user.id);

    // Emit audit event
    this.authEvents.emit({
      type: 'verification.email_verified',
      userId: user.id,
      email: tokenRecord.identifier,
      ip: params.requestContext?.ip,
      timestamp: new Date(),
    });

    return {
      userId: user.id,
      email: tokenRecord.identifier,
    };
  }

  /**
   * Resend verification email
   * Creates a new token after invalidating existing ones
   * Returns null if user doesn't exist or is already verified (to prevent enumeration)
   */
  async resendVerificationEmail(
    params: ResendVerificationParams
  ): Promise<CreateVerificationTokenResult | null> {
    const normalizedEmail = params.email.toLowerCase().trim();

    // Find user
    const user = await this.userRepo.findByEmail(normalizedEmail);

    // Don't reveal if user exists
    if (!user) {
      return null;
    }

    // Check if already verified
    if (user.emailVerified) {
      // Don't reveal verification status
      return null;
    }

    // Invalidate existing tokens
    await this.verificationRepo.invalidateAllForEmail(
      normalizedEmail,
      'email_verification'
    );

    // Create new token
    return this.createEmailVerificationToken({
      email: normalizedEmail,
      type: 'email_verification',
      ...(params.requestContext && { requestContext: params.requestContext }),
    });
  }
}
