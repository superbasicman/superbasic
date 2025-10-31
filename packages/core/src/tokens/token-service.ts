/**
 * Token Service
 * 
 * Business logic layer for API token operations
 * Implements business rules, orchestrates repositories, and emits domain events
 */

import type { ApiKey } from "@repo/database";
import { generateToken, hashToken, validateScopes } from "@repo/auth";
import type { TokenRepository } from "./token-repository.js";
import {
  DuplicateTokenNameError,
  InvalidScopesError,
  InvalidExpirationError,
  TokenNotFoundError,
} from "./token-errors.js";
import type {
  CreateTokenParams,
  CreateTokenResult,
  TokenResponse,
  UpdateTokenParams,
  ListTokensParams,
  RevokeTokenParams,
} from "./token-types.js";

/**
 * Auth events interface for audit logging
 * Matches the authEvents.emit() signature from @repo/auth
 */
interface AuthEvents {
  emit(event: {
    type: string;
    userId?: string;
    metadata?: Record<string, any>;
  }): Promise<void>;
}

export class TokenService {
  constructor(
    private tokenRepo: TokenRepository,
    private authEvents: AuthEvents
  ) {}

  /**
   * Create a new API token
   * 
   * Business rules:
   * - Token names must be unique per user
   * - Scopes must be valid
   * - Expiration must be between 1-365 days
   * 
   * @param params - Token creation parameters
   * @returns Token result with plaintext token (shown once) and metadata
   * @throws {DuplicateTokenNameError} If token name already exists for user
   * @throws {InvalidScopesError} If scopes are invalid
   * @throws {InvalidExpirationError} If expiration is out of range
   */
  async createToken(params: CreateTokenParams): Promise<CreateTokenResult> {
    // Validate business rules
    this.validateTokenParams(params);

    // Check for duplicate name
    const isDuplicate = await this.tokenRepo.existsByUserAndName(
      params.userId,
      params.name
    );

    if (isDuplicate) {
      throw new DuplicateTokenNameError(params.name);
    }

    // Generate token and extract metadata
    const token = generateToken();
    const keyHash = hashToken(token);
    const last4 = token.slice(-4);

    // Calculate expiration date
    const expiresAt = this.calculateExpiration(params.expiresInDays);

    // Create token record via repository
    const apiKey = await this.tokenRepo.create({
      userId: params.userId,
      profileId: params.profileId || null,
      name: params.name,
      keyHash,
      last4,
      scopes: params.scopes,
      expiresAt,
    });

    // Emit audit event for token creation
    this.authEvents.emit({
      type: "token.created",
      userId: params.userId,
      metadata: {
        tokenId: apiKey.id,
        profileId: params.profileId || null,
        tokenName: params.name,
        scopes: params.scopes,
        expiresAt: expiresAt.toISOString(),
        ip: params.requestContext?.ip || "unknown",
        userAgent: params.requestContext?.userAgent || "unknown",
        requestId: params.requestContext?.requestId || "unknown",
        timestamp: new Date().toISOString(),
      },
    });

    // Return result with plaintext token (shown once)
    return {
      token, // Plaintext - user must save this
      apiKey: this.mapToTokenResponse(apiKey),
    };
  }

  /**
   * List all active tokens for a user
   * 
   * @param params - List parameters with userId
   * @returns Array of token metadata (no plaintext tokens)
   */
  async listTokens(params: ListTokensParams): Promise<TokenResponse[]> {
    const tokens = await this.tokenRepo.findActiveByUserId(params.userId);
    return tokens.map((token) => this.mapToTokenResponse(token));
  }

  /**
   * Update token name
   * 
   * Business rules:
   * - Token must exist and belong to user
   * - Token must not be revoked
   * - New name must be unique per user
   * 
   * @param params - Update parameters with token ID, userId, and new name
   * @returns Updated token metadata
   * @throws {TokenNotFoundError} If token not found, doesn't belong to user, or is revoked
   * @throws {DuplicateTokenNameError} If new name already exists for user
   */
  async updateToken(params: UpdateTokenParams): Promise<TokenResponse> {
    // Find token and verify ownership
    const token = await this.tokenRepo.findById(params.id);

    // Return 404 if token not found, belongs to different user, or is revoked
    if (!token || token.userId !== params.userId || token.revokedAt) {
      throw new TokenNotFoundError(params.id);
    }

    // Check for duplicate name (unique per user)
    const isDuplicate = await this.tokenRepo.existsByUserAndName(
      params.userId,
      params.name
    );

    // If duplicate exists and it's not the current token, reject
    if (isDuplicate) {
      const existing = await this.tokenRepo.findById(params.id);
      if (existing && existing.name !== params.name) {
        throw new DuplicateTokenNameError(params.name);
      }
    }

    // Update token name via repository
    const updated = await this.tokenRepo.update(params.id, {
      name: params.name,
    });

    return this.mapToTokenResponse(updated);
  }

  /**
   * Revoke a token (soft delete)
   * 
   * Business rules:
   * - Token must exist and belong to user
   * - Operation is idempotent (already revoked = success)
   * 
   * @param params - Revoke parameters with token ID and userId
   * @throws {TokenNotFoundError} If token not found or doesn't belong to user
   */
  async revokeToken(params: RevokeTokenParams): Promise<void> {
    // Find token and verify ownership
    const token = await this.tokenRepo.findById(params.id);

    // Return 404 if token not found or belongs to different user
    if (!token || token.userId !== params.userId) {
      throw new TokenNotFoundError(params.id);
    }

    // Idempotent: if already revoked, skip database update but still succeed
    if (!token.revokedAt) {
      // Soft delete token via repository
      await this.tokenRepo.revoke(params.id);

      // Emit audit event (only on first revocation)
      this.authEvents.emit({
        type: "token.revoked",
        userId: params.userId,
        metadata: {
          tokenId: params.id,
          profileId: token.profileId,
          tokenName: token.name,
          ip: params.requestContext?.ip || "unknown",
          userAgent: params.requestContext?.userAgent || "unknown",
          requestId: params.requestContext?.requestId || "unknown",
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  /**
   * Validate token creation parameters
   * 
   * @param params - Token creation parameters
   * @throws {InvalidScopesError} If scopes are invalid
   * @throws {InvalidExpirationError} If expiration is out of range
   */
  private validateTokenParams(params: CreateTokenParams): void {
    // Validate scopes
    if (!validateScopes(params.scopes)) {
      throw new InvalidScopesError(params.scopes);
    }

    // Validate expiration (1-365 days)
    if (params.expiresInDays < 1 || params.expiresInDays > 365) {
      throw new InvalidExpirationError(params.expiresInDays);
    }
  }

  /**
   * Calculate expiration date from days
   * 
   * @param days - Number of days until expiration
   * @returns Expiration date
   */
  private calculateExpiration(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  /**
   * Map database entity to domain response
   * 
   * @param apiKey - Database entity
   * @returns Token response with masked token
   */
  private mapToTokenResponse(apiKey: ApiKey): TokenResponse {
    return {
      id: apiKey.id,
      name: apiKey.name,
      scopes: apiKey.scopes as string[],
      createdAt: apiKey.createdAt.toISOString(),
      lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
      expiresAt: apiKey.expiresAt?.toISOString() ?? null,
      maskedToken: `sbf_****${apiKey.last4}`,
    };
  }
}
