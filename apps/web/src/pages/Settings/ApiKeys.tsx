import { useState, useEffect } from 'react';
import { Button } from '@repo/design-system';
import { tokenApi, ApiError } from '../../lib/api';
import type { TokenResponse } from '@repo/types';
import { CreateTokenModal } from '../../components/CreateTokenModal';
import { TokenDisplayModal } from '../../components/TokenDisplayModal';
import { RevokeTokenDialog } from '../../components/RevokeTokenDialog';
import { EditTokenNameDialog } from '../../components/EditTokenNameDialog';

export default function ApiKeys() {
  const [tokens, setTokens] = useState<TokenResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTokenDisplay, setShowTokenDisplay] = useState(false);
  const [createdToken, setCreatedToken] = useState<{ token: string; name: string } | null>(null);

  // Revoke dialog state
  const [tokenToRevoke, setTokenToRevoke] = useState<TokenResponse | null>(null);

  // Edit name dialog state
  const [tokenToEdit, setTokenToEdit] = useState<TokenResponse | null>(null);
  const [scopeFilter, setScopeFilter] = useState('');
  const [workspaceFilter, setWorkspaceFilter] = useState<'all' | 'bound' | 'unbound'>('all');

  useEffect(() => {
    loadTokens();
  }, []);

  async function loadTokens() {
    try {
      setIsLoading(true);
      setError(null);
      const response = await tokenApi.list();
      setTokens(response.tokens);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load API keys');
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleCreateSuccess(token: string, name: string) {
    setShowCreateModal(false);
    setCreatedToken({ token, name });
    setShowTokenDisplay(true);
    loadTokens(); // Refresh the list
  }

  function handleTokenDisplayClose() {
    setShowTokenDisplay(false);
    setCreatedToken(null);
  }

  async function handleRevoke(token: TokenResponse) {
    setTokenToRevoke(token);
  }

  async function confirmRevoke() {
    if (!tokenToRevoke) return;

    try {
      await tokenApi.revoke(tokenToRevoke.id);
      setTokenToRevoke(null);
      loadTokens(); // Refresh the list
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to revoke token');
      }
    }
  }

  function handleEdit(token: TokenResponse) {
    setTokenToEdit(token);
  }

  async function handleEditSave(newName: string) {
    if (!tokenToEdit) return;

    try {
      await tokenApi.update(tokenToEdit.id, { name: newName });
      setTokenToEdit(null);
      loadTokens(); // Refresh the list
    } catch (err) {
      if (err instanceof ApiError) {
        throw err; // Let the dialog handle the error
      } else {
        throw new Error('Failed to update token name');
      }
    }
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return 'Never';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

    return date.toLocaleDateString();
  }

  function getUsageIndicator(lastUsedAt: string | null): { text: string; className: string } {
    if (!lastUsedAt) {
      return { text: 'Never used', className: 'text-gray-500 bg-gray-100' };
    }

    const date = new Date(lastUsedAt);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays >= 30) {
      return { text: `Unused for ${diffDays} days`, className: 'text-yellow-700 bg-yellow-100' };
    }

    return { text: formatDate(lastUsedAt), className: 'text-green-700 bg-green-100' };
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent"></div>
          <p className="mt-2 text-sm text-gray-600">Loading API keys...</p>
        </div>
      </div>
    );
  }

  const filteredTokens = tokens.filter((token) => {
    const scopeMatch = scopeFilter
      ? token.scopes.some((s) => s.toLowerCase().includes(scopeFilter.toLowerCase()))
      : true;
    const workspaceMatch =
      workspaceFilter === 'all'
        ? true
        : workspaceFilter === 'bound'
          ? Boolean(token.workspaceId)
          : !token.workspaceId;
    return scopeMatch && workspaceMatch;
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">API Keys</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage your API keys for programmatic access to SuperBasic Finance
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">{error}</h3>
              </div>
            </div>
          </div>
        )}

        {/* Create + filters */}
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            Create API Key
          </Button>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              type="text"
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              placeholder="Filter by scope (e.g. read:transactions)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 md:w-64"
            />
            <select
              value={workspaceFilter}
              onChange={(e) => setWorkspaceFilter(e.target.value as typeof workspaceFilter)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 md:w-48"
            >
              <option value="all">All tokens</option>
              <option value="bound">Workspace-bound</option>
              <option value="unbound">Not bound</option>
            </select>
          </div>
        </div>

        {/* Token list */}
        {filteredTokens.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No API keys</h3>
            <p className="mt-1 text-sm text-gray-500">Get started by creating your first API key</p>
            <div className="mt-6">
              <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                Create API Key
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden bg-white shadow sm:rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Token
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Scopes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Workspace
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Last Used
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Expires
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredTokens.map((token) => {
                  const usageIndicator = getUsageIndicator(token.lastUsedAt);
                  return (
                    <tr key={token.id}>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {token.name}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-mono text-gray-500">
                        {token.maskedToken}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div className="flex flex-wrap gap-1">
                          {token.scopes.map((scope) => (
                            <span
                              key={scope}
                              className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                            >
                              {scope}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {token.workspaceId ? (
                          <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                            Workspace {token.workspaceId.slice(0, 8)}…
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                            Not bound
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {formatDate(token.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${usageIndicator.className}`}
                        >
                          {usageIndicator.text}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {token.expiresAt ? formatDate(token.expiresAt) : 'Never'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                        <button
                          onClick={() => handleEdit(token)}
                          className="mr-4 text-primary-600 hover:text-primary-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleRevoke(token)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateTokenModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {showTokenDisplay && createdToken && (
        <TokenDisplayModal
          token={createdToken.token}
          name={createdToken.name}
          onClose={handleTokenDisplayClose}
        />
      )}

      {tokenToRevoke && (
        <RevokeTokenDialog
          token={tokenToRevoke}
          onConfirm={confirmRevoke}
          onCancel={() => setTokenToRevoke(null)}
        />
      )}

      {tokenToEdit && (
        <EditTokenNameDialog
          token={tokenToEdit}
          onSave={handleEditSave}
          onCancel={() => setTokenToEdit(null)}
        />
      )}
    </div>
  );
}
