import { useState, type FormEvent } from 'react';
import { Button } from '@repo/design-system';
import { tokenApi, ApiError } from '../lib/api';
import { VALID_SCOPES } from '@repo/types';

interface CreateTokenModalProps {
  onClose: () => void;
  onSuccess: (token: string, name: string) => void;
}

export function CreateTokenModal({ onClose, onSuccess }: CreateTokenModalProps) {
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation errors
  const [nameError, setNameError] = useState<string | null>(null);
  const [scopesError, setScopesError] = useState<string | null>(null);

  const validateName = (value: string): boolean => {
    if (!value.trim()) {
      setNameError('Token name is required');
      return false;
    }
    if (value.length > 100) {
      setNameError('Token name must be 100 characters or less');
      return false;
    }
    setNameError(null);
    return true;
  };

  const validateScopes = (scopes: string[]): boolean => {
    if (scopes.length === 0) {
      setScopesError('At least one scope is required');
      return false;
    }
    setScopesError(null);
    return true;
  };

  const handleScopeToggle = (scope: string) => {
    setSelectedScopes((prev) => {
      const newScopes = prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope];

      // Clear error when user selects a scope
      if (newScopes.length > 0) {
        setScopesError(null);
      }

      return newScopes;
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Validate all fields
    const isNameValid = validateName(name);
    const isScopesValid = validateScopes(selectedScopes);

    if (!isNameValid || !isScopesValid) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await tokenApi.create({
        name: name.trim(),
        scopes: selectedScopes,
        expiresInDays,
      });

      onSuccess(response.token, response.name);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to create API key. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Group scopes by resource
  const scopeGroups = {
    Transactions: VALID_SCOPES.filter((s) => s.includes('transactions')),
    Budgets: VALID_SCOPES.filter((s) => s.includes('budgets')),
    Accounts: VALID_SCOPES.filter((s) => s.includes('accounts')),
    Profile: VALID_SCOPES.filter((s) => s.includes('profile')),
    Workspaces: VALID_SCOPES.filter((s) => s.includes('workspaces')),
    Admin: VALID_SCOPES.filter((s) => s === 'admin'),
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
          <form onSubmit={handleSubmit}>
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mt-3 w-full text-center sm:mt-0 sm:text-left">
                  <h3 className="text-lg font-medium leading-6 text-gray-900">Create API Key</h3>
                  <p className="mt-2 text-sm text-gray-500">
                    Create a new API key for programmatic access to your account
                  </p>

                  {/* Error message */}
                  {error && (
                    <div className="mt-4 rounded-md bg-red-50 p-4">
                      <div className="flex">
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-red-800">{error}</h3>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-6 space-y-6">
                    {/* Name field */}
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="name"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (nameError) validateName(e.target.value);
                        }}
                        onBlur={(e) => validateName(e.target.value)}
                        className={`mt-1 block w-full rounded-md border ${
                          nameError ? 'border-red-300' : 'border-gray-300'
                        } px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm`}
                        placeholder="e.g., CI/CD Pipeline, Mobile App"
                      />
                      {nameError && <p className="mt-1 text-sm text-red-600">{nameError}</p>}
                    </div>

                    {/* Scopes field */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Scopes <span className="text-red-500">*</span>
                      </label>
                      <p className="mt-1 text-sm text-gray-500">
                        Select the permissions this API key should have
                      </p>
                      <div className="mt-3 space-y-4">
                        {Object.entries(scopeGroups).map(([group, scopes]) => {
                          if (scopes.length === 0) return null;
                          return (
                            <div key={group}>
                              <p className="text-sm font-medium text-gray-700">{group}</p>
                              <div className="mt-2 space-y-2">
                                {scopes.map((scope) => (
                                  <label key={scope} className="flex items-center">
                                    <input
                                      type="checkbox"
                                      checked={selectedScopes.includes(scope)}
                                      onChange={() => handleScopeToggle(scope)}
                                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">{scope}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {scopesError && <p className="mt-2 text-sm text-red-600">{scopesError}</p>}
                    </div>

                    {/* Expiration field */}
                    <div>
                      <label
                        htmlFor="expiration"
                        className="block text-sm font-medium text-gray-700"
                      >
                        Expiration
                      </label>
                      <select
                        id="expiration"
                        value={expiresInDays}
                        onChange={(e) => setExpiresInDays(Number(e.target.value))}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                      >
                        <option value={30}>30 days</option>
                        <option value={60}>60 days</option>
                        <option value={90}>90 days (recommended)</option>
                        <option value={180}>180 days</option>
                        <option value={365}>365 days</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
              <Button
                type="submit"
                variant="primary"
                disabled={isLoading}
                className="w-full sm:ml-3 sm:w-auto"
              >
                {isLoading ? 'Creating...' : 'Create API Key'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isLoading}
                className="mt-3 w-full sm:mt-0 sm:w-auto"
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
