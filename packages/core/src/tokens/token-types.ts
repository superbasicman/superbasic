/**
 * Token Domain Types
 *
 * Type definitions for token service layer
 * These types define the interfaces between layers (HTTP → Service → Repository)
 */
import type { TokenHashEnvelope } from "@repo/auth";

export interface CreateTokenParams {
  userId: string;
  profileId: string;
  name: string;
  scopes: string[];
  expiresInDays: number;
  requestContext?: {
    ip?: string;
    userAgent?: string;
    requestId?: string;
  };
}

export interface CreateTokenData {
  userId: string;
  profileId: string;
  name: string;
  keyHash: TokenHashEnvelope;
  last4: string;
  scopes: string[];
  expiresAt: Date;
}

export interface CreateTokenResult {
  token: string; // Plaintext (shown once)
  apiKey: TokenResponse;
}

export interface TokenResponse {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  maskedToken: string;
}

export interface UpdateTokenParams {
  id: string;
  userId: string;
  name: string;
}

export interface UpdateTokenData {
  name: string;
}

export interface ListTokensParams {
  userId: string;
}

export interface RevokeTokenParams {
  id: string;
  userId: string;
  requestContext?: {
    ip?: string;
    userAgent?: string;
    requestId?: string;
  };
}
