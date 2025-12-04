import { Button } from '@repo/design-system';
import type { TokenResponse } from '@repo/types';

interface RevokeTokenDialogProps {
  token: TokenResponse;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RevokeTokenDialog({ token, onConfirm, onCancel }: RevokeTokenDialogProps) {
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
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                <svg
                  className="h-6 w-6 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 className="text-lg font-medium leading-6 text-gray-900">Revoke API Key</h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    Are you sure you want to revoke the API key{' '}
                    <span className="font-medium text-gray-900">{token.name}</span>?
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    This action cannot be undone. Any applications using this key will immediately
                    lose access.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
            <Button
              type="button"
              variant="primary"
              onClick={onConfirm}
              className="w-full bg-red-600 hover:bg-red-700 focus:ring-red-500 sm:ml-3 sm:w-auto"
            >
              Revoke
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              className="mt-3 w-full sm:mt-0 sm:w-auto"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
