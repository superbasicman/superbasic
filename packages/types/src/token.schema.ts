/**
 * Token management schemas for API key creation, listing, and revocation
 * Used for request/response validation and type generation
 */

import { z } from "zod";
import { VALID_SCOPES } from "./scopes.js";

/**
 * Request schema for creating a new API token
 * - name: User-friendly label (1-100 characters)
 * - scopes: Array of valid permission scopes (at least one required)
 * - expiresInDays: Optional expiration period (1-365 days, default 90)
 */
export const CreateTokenRequestSchema = z.object({
  name: z
    .string()
    .min(1, "Token name is required")
    .max(100, "Token name must be 100 characters or less")
    .trim(),
  scopes: z
    .array(z.enum(VALID_SCOPES as unknown as [string, ...string[]]))
    .min(1, "At least one scope is required")
    .refine(
      (scopes) => new Set(scopes).size === scopes.length,
      "Duplicate scopes are not allowed"
    ),
  expiresInDays: z
    .number()
    .int("Expiration must be a whole number of days")
    .min(1, "Expiration must be at least 1 day")
    .max(365, "Expiration cannot exceed 365 days")
    .optional()
    .default(90),
});

/**
 * Response schema for token metadata (without plaintext token)
 * Used for token listing and update responses
 */
export const TokenResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.string(), // ISO 8601 timestamp
  lastUsedAt: z.string().nullable(), // ISO 8601 timestamp or null
  expiresAt: z.string().nullable(), // ISO 8601 timestamp or null
  maskedToken: z.string(), // e.g., "sbf_****abcd"
});

/**
 * Response schema for token creation (includes plaintext token)
 * Plaintext token is shown once and never retrievable again
 */
export const CreateTokenResponseSchema = TokenResponseSchema.extend({
  token: z.string(), // Plaintext token (shown once)
});

/**
 * Response schema for token list endpoint
 */
export const ListTokensResponseSchema = z.object({
  tokens: z.array(TokenResponseSchema),
});

/**
 * Request schema for updating token name
 */
export const UpdateTokenRequestSchema = z.object({
  name: z
    .string()
    .min(1, "Token name is required")
    .max(100, "Token name must be 100 characters or less")
    .trim(),
});

// Export TypeScript types derived from schemas
export type CreateTokenRequest = z.infer<typeof CreateTokenRequestSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
export type CreateTokenResponse = z.infer<typeof CreateTokenResponseSchema>;
export type ListTokensResponse = z.infer<typeof ListTokensResponseSchema>;
export type UpdateTokenRequest = z.infer<typeof UpdateTokenRequestSchema>;
