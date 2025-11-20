import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_ROLES,
  WORKSPACE_ROLE_SCOPE_MAP,
  deriveScopesFromRoles,
  isWorkspaceRole,
} from '../authz.js';
import type { PermissionScope } from '../types.js';

const sortScopes = (scopes: readonly string[]) => [...scopes].sort();

const ADMIN_SCOPE_SET: PermissionScope[] = [
  'read:transactions',
  'write:transactions',
  'read:budgets',
  'write:budgets',
  'read:accounts',
  'write:accounts',
  'read:profile',
  'write:profile',
  'read:workspaces',
  'write:workspaces',
];

const OWNER_SCOPE_SET: PermissionScope[] = [...ADMIN_SCOPE_SET, 'admin'];

const MEMBER_SCOPE_SET: PermissionScope[] = [
  'read:transactions',
  'write:transactions',
  'read:budgets',
  'write:budgets',
  'read:accounts',
  'write:accounts',
  'read:profile',
  'write:profile',
  'read:workspaces',
];

const VIEWER_SCOPE_SET: PermissionScope[] = [
  'read:transactions',
  'read:budgets',
  'read:accounts',
  'read:profile',
  'write:profile',
  'read:workspaces',
];

describe('workspace role scope mapping', () => {
  it('grants owners the full scope set', () => {
    expect(sortScopes(WORKSPACE_ROLE_SCOPE_MAP.owner)).toEqual(sortScopes(OWNER_SCOPE_SET));
  });

  it('grants admins write access without system-level admin scope', () => {
    expect(sortScopes(WORKSPACE_ROLE_SCOPE_MAP.admin)).toEqual(sortScopes(ADMIN_SCOPE_SET));
    expect(WORKSPACE_ROLE_SCOPE_MAP.admin).not.toContain('admin');
  });

  it('grants members read/write access to workspace data without management scopes', () => {
    expect(sortScopes(WORKSPACE_ROLE_SCOPE_MAP.member)).toEqual(sortScopes(MEMBER_SCOPE_SET));
  });

  it('limits viewers to read-only workspace data but still allows profile management', () => {
    expect(sortScopes(WORKSPACE_ROLE_SCOPE_MAP.viewer)).toEqual(sortScopes(VIEWER_SCOPE_SET));
    expect(WORKSPACE_ROLE_SCOPE_MAP.viewer).not.toContain('write:transactions');
  });

  it('merges scopes across multiple roles without duplicates', () => {
    const merged = deriveScopesFromRoles(['viewer', 'admin']);
    expect(sortScopes(merged)).toEqual(sortScopes(WORKSPACE_ROLE_SCOPE_MAP.admin));
  });

  it('validates workspace role values', () => {
    expect(isWorkspaceRole('owner')).toBe(true);
    expect(isWorkspaceRole('invalid-role')).toBe(false);
    expect(isWorkspaceRole(null)).toBe(false);
    expect(WORKSPACE_ROLES).toEqual(['owner', 'admin', 'member', 'viewer']);
  });
});
