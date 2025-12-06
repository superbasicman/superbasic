/**
 * Verification Domain Types
 *
 * Type definitions for verification service layer
 * These types define the interfaces between layers (HTTP → Service → Repository)
 */

export interface CreateVerificationTokenParams {
  email: string;
  type: 'email_verification' | 'password_reset' | 'magic_link' | 'invite';
  expiresInHours?: number;
  requestContext?: {
    ip?: string;
    userAgent?: string;
    requestId?: string;
  };
}

export interface CreateVerificationTokenResult {
  /** Full token value to send in email (ev_<tokenId>.<secret>) */
  tokenValue: string;
  expiresAt: Date;
}

export interface VerifyEmailTokenParams {
  /** Full token value (ev_<tokenId>.<secret>) */
  token: string;
  requestContext?: {
    ip?: string;
    userAgent?: string;
    requestId?: string;
  };
}

export interface VerifyEmailTokenResult {
  userId: string;
  email: string;
}

export interface ResendVerificationParams {
  email: string;
  requestContext?: {
    ip?: string;
    userAgent?: string;
    requestId?: string;
  };
}
