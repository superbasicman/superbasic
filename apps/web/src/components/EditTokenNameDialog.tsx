import { useState, type FormEvent } from 'react';
import { Button } from '@repo/design-system';
import type { TokenResponse } from '@repo/types';
import { ApiError } from '../lib/api';

interface EditTokenNameDialogProps {
  token: TokenResponse;
  onSave: (newName: string) => Promise<void>;
  onCancel: () => void;
}

export function EditTokenNameDialog({ token, onSave, onCancel }: EditTokenNameDialogProps) {
  const [name, setName] = useState(token.name);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!validateName(name)) {
      return;
    }

    setIsLoading(true);

    try {
      await onSave(name.trim());
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to update token name. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onCancel}
        />

        {/* Modal panel */}
        <div className="inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
          <form onSubmit={handleSubmit}>
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mt-3 w-full text-center sm:mt-0 sm:text-left">
                  <h3 className="text-lg font-medium leading-6 text-gray-900">
                    Edit Token Name
                  </h3>
                  <p className="mt-2 text-sm text-gray-500">
                    Update the name for this API key
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

                  <div className="mt-6">
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
                      {nameError && (
                        <p className="mt-1 text-sm text-red-600">{nameError}</p>
                      )}
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
                {isLoading ? 'Saving...' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
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
