/**
 * Role-Based Access Control (RBAC) scope definitions
 *
 * Defines fine-grained API scopes for workspace members and API keys.
 * Scopes follow the pattern: {action}:{resource}
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

/**
 * Check if a scope is valid
 *
 * @param scope - The scope to validate
 * @returns True if the scope is in the valid scope set
 */
export function isValidScope(scope: string): scope is Scope {
  return VALID_SCOPES.includes(scope as Scope);
}

/**
 * Validate that all provided scopes are valid
 *
 * @param scopes - Array of scopes to validate
 * @returns True if all scopes are valid
 */
export function validateScopes(scopes: string[]): boolean {
  return scopes.every((scope) => isValidScope(scope));
}

/**
 * Check if a set of scopes includes a required scope
 * "admin" scope grants all permissions
 *
 * @param userScopes - The scopes the user/token has
 * @param requiredScope - The scope required for the operation
 * @returns True if the user has the required scope or admin scope
 */
export function hasScope(userScopes: string[], requiredScope: Scope): boolean {
  return userScopes.includes('admin') || userScopes.includes(requiredScope);
}

/**
 * Check if a set of scopes includes all required scopes
 *
 * @param userScopes - The scopes the user/token has
 * @param requiredScopes - The scopes required for the operation
 * @returns True if the user has all required scopes or admin scope
 */
export function hasAllScopes(userScopes: string[], requiredScopes: Scope[]): boolean {
  if (userScopes.includes('admin')) {
    return true;
  }
  return requiredScopes.every((scope) => userScopes.includes(scope));
}

/**
 * Check if a set of scopes includes any of the required scopes
 *
 * @param userScopes - The scopes the user/token has
 * @param requiredScopes - The scopes required for the operation
 * @returns True if the user has any of the required scopes or admin scope
 */
export function hasAnyScope(userScopes: string[], requiredScopes: Scope[]): boolean {
  if (userScopes.includes('admin')) {
    return true;
  }
  return requiredScopes.some((scope) => userScopes.includes(scope));
}

/**
 * Legacy RBAC scopes for backward compatibility
 * @deprecated Use VALID_SCOPES instead
 */
export const RBAC_SCOPES = {
  // Account management
  'account:read': 'Read account information',
  'account:write': 'Update account settings',

  // Workspace management
  'workspace:read': 'Read workspace information',
  'workspace:write': 'Update workspace settings',
  'workspace:delete': 'Delete workspace',

  // Transaction access
  'transactions:read': 'Read transaction data',
  'transactions:write': 'Create or update transactions',

  // Budget management
  'budgets:read': 'Read budget information',
  'budgets:write': 'Create or update budgets',

  // API key management
  'api_keys:read': 'List API keys',
  'api_keys:write': 'Create or revoke API keys',

  // Billing access
  'billing:read': 'Read billing information',
  'billing:write': 'Manage billing and subscriptions',
} as const;

export type RBACScope = keyof typeof RBAC_SCOPES;

/**
 * Predefined role templates with common scope combinations
 * @deprecated Use VALID_SCOPES instead
 */
export const RBAC_ROLES = {
  owner: Object.keys(RBAC_SCOPES) as RBACScope[],
  admin: [
    'account:read',
    'account:write',
    'workspace:read',
    'workspace:write',
    'transactions:read',
    'transactions:write',
    'budgets:read',
    'budgets:write',
    'api_keys:read',
    'api_keys:write',
    'billing:read',
  ] as RBACScope[],
  member: ['account:read', 'workspace:read', 'transactions:read', 'budgets:read'] as RBACScope[],
  readonly: ['account:read', 'workspace:read', 'transactions:read', 'budgets:read'] as RBACScope[],
} as const;

export type RBACRole = keyof typeof RBAC_ROLES;
