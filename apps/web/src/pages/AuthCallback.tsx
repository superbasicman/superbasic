import { useAuth } from '../contexts/AuthContext';

/**
 * OAuth Callback Page
 *
 * This page renders while the OAuth authorization code exchange is being processed.
 * The actual callback handling is done by AuthContext.handleCallback() which:
 * 1. Validates the state parameter against stored PKCE state
 * 2. Exchanges the authorization code for tokens
 * 3. Fetches the user profile
 * 4. Redirects to the home page on success
 */
export default function AuthCallback() {
  const { authError, isLoading } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-6 text-center">
        <div className="mb-4 text-lg font-semibold">
          {isLoading ? 'Completing sign-in...' : 'Processing...'}
        </div>
        {authError ? (
          <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {authError}
          </div>
        ) : (
          <div className="rounded border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Please wait while we finish signing you in.
          </div>
        )}
      </div>
    </div>
  );
}
