import { AuthorizationError } from './errors.js';
import type { AuthzService } from './interfaces.js';
import type {
  AuthContext,
  PermissionScope,
  WorkspaceAssertionOptions,
  WorkspaceRole,
  WorkspaceRoleScopeMap,
} from './types.js';

type ScopeList = readonly PermissionScope[];

export const GLOBAL_PERMISSION_SCOPES = [
  'read:profile',
  'write:profile',
] as const satisfies ScopeList;

export const WORKSPACE_BASE_SCOPES = ['read:workspaces'] as const satisfies ScopeList;

export const WORKSPACE_DATA_READ_SCOPES = [
  'read:transactions',
  'read:budgets',
  'read:accounts',
] as const satisfies ScopeList;

export const WORKSPACE_DATA_WRITE_SCOPES = [
  'write:transactions',
  'write:budgets',
  'write:accounts',
] as const satisfies ScopeList;

export const WORKSPACE_ADMIN_SCOPES = ['write:workspaces'] as const satisfies ScopeList;

const OWNER_SYSTEM_SCOPES = ['admin'] as const satisfies ScopeList;

const viewerScopes = [
  ...WORKSPACE_BASE_SCOPES,
  ...WORKSPACE_DATA_READ_SCOPES,
  ...GLOBAL_PERMISSION_SCOPES,
] as const satisfies ScopeList;

const memberScopes = [...viewerScopes, ...WORKSPACE_DATA_WRITE_SCOPES] as const satisfies ScopeList;

const adminScopes = [...memberScopes, ...WORKSPACE_ADMIN_SCOPES] as const satisfies ScopeList;

const ownerScopes = [...adminScopes, ...OWNER_SYSTEM_SCOPES] as const satisfies ScopeList;

export const WORKSPACE_ROLE_SCOPE_MAP = {
  owner: ownerScopes,
  admin: adminScopes,
  member: memberScopes,
  viewer: viewerScopes,
} as const satisfies WorkspaceRoleScopeMap;

export const WORKSPACE_ROLES: WorkspaceRole[] = ['owner', 'admin', 'member', 'viewer'];

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === 'string' && WORKSPACE_ROLES.includes(value as WorkspaceRole);
}

export function getWorkspaceRoleScopes(role: WorkspaceRole): readonly PermissionScope[] {
  return WORKSPACE_ROLE_SCOPE_MAP[role];
}

export function deriveScopesFromRoles(roles: Iterable<WorkspaceRole>): PermissionScope[] {
  const seen = new Set<PermissionScope>();
  for (const role of roles) {
    const scopes = WORKSPACE_ROLE_SCOPE_MAP[role];
    for (const scope of scopes) {
      if (!seen.has(scope)) {
        seen.add(scope);
      }
    }
  }
  return [...seen];
}

export const authz: AuthzService = {
  hasScope(auth: AuthContext | null, scope: PermissionScope): boolean {
    if (!auth) {
      return false;
    }
    return auth.scopes.includes('admin') || auth.scopes.includes(scope);
  },

  requireScope(auth: AuthContext | null, scope: PermissionScope): asserts auth is AuthContext {
    if (!auth) {
      throw new AuthorizationError('Unauthorized');
    }
    if (!this.hasScope(auth, scope)) {
      throw new AuthorizationError('Insufficient permissions');
    }
  },

  hasAnyScope(auth: AuthContext | null, scopes: PermissionScope[]): boolean {
    if (!auth) {
      return false;
    }
    if (auth.scopes.includes('admin')) {
      return true;
    }
    return scopes.some((scope) => auth.scopes.includes(scope));
  },

  requireAnyScope(
    auth: AuthContext | null,
    scopes: PermissionScope[]
  ): asserts auth is AuthContext {
    if (!auth) {
      throw new AuthorizationError('Unauthorized');
    }
    if (!this.hasAnyScope(auth, scopes)) {
      throw new AuthorizationError('Insufficient permissions');
    }
  },

  hasWorkspaceRole(auth: AuthContext | null, role: WorkspaceRole): boolean {
    if (!auth) {
      return false;
    }
    return auth.roles.includes(role);
  },

  requireWorkspaceRole(auth: AuthContext | null, role: WorkspaceRole): asserts auth is AuthContext {
    if (!auth) {
      throw new AuthorizationError('Unauthorized');
    }
    if (!this.hasWorkspaceRole(auth, role)) {
      throw new AuthorizationError('Insufficient permissions');
    }
  },

  assertWorkspaceAccess(
    auth: AuthContext | null,
    options?: WorkspaceAssertionOptions
  ): string | null {
    if (!auth) {
      throw new AuthorizationError('Unauthorized');
    }

    const activeId = auth.activeWorkspaceId;

    if (options?.workspaceId && activeId !== options.workspaceId) {
      throw new AuthorizationError('Workspace access denied');
    }

    if (!options?.allowNull && !activeId) {
      throw new AuthorizationError('Workspace required');
    }

    return activeId;
  },
};
