/**
 * Role-Based Access Control (RBAC) scope definitions
 *
 * Defines fine-grained API scopes for workspace members and API keys.
 * Scopes follow the pattern: {resource}:{action}
 */

/**
 * Available RBAC scopes for API access control
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

/**
 * Check if a set of scopes includes a required scope
 */
export function hasScope(userScopes: RBACScope[], requiredScope: RBACScope): boolean {
  return userScopes.includes(requiredScope);
}

/**
 * Check if a set of scopes includes all required scopes
 */
export function hasAllScopes(userScopes: RBACScope[], requiredScopes: RBACScope[]): boolean {
  return requiredScopes.every((scope) => userScopes.includes(scope));
}

/**
 * Check if a set of scopes includes any of the required scopes
 */
export function hasAnyScope(userScopes: RBACScope[], requiredScopes: RBACScope[]): boolean {
  return requiredScopes.some((scope) => userScopes.includes(scope));
}
