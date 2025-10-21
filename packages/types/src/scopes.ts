/**
 * API scope definitions
 *
 * Defines fine-grained API scopes for workspace members and API keys.
 * Scopes follow the pattern: {action}:{resource}
 *
 * This file is in @repo/types (not @repo/auth) so it can be safely
 * imported by both the API and web client without circular dependencies.
 */

/**
 * Valid API scopes for token permissions
 * Format: <action>:<resource>
 */
export const VALID_SCOPES = [
  // Transaction scopes
  'read:transactions',
  'write:transactions',

  // Budget scopes
  'read:budgets',
  'write:budgets',

  // Account scopes
  'read:accounts',
  'write:accounts',

  // Profile scopes
  'read:profile',
  'write:profile',

  // Workspace scopes (future)
  'read:workspaces',
  'write:workspaces',

  // Admin scope (full access)
  'admin',
] as const;

export type Scope = (typeof VALID_SCOPES)[number];
