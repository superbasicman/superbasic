import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi, ApiError } from '../lib/api';
import { clearTokens } from '../lib/tokenStorage';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'success'>('pending');

  useEffect(() => {
    let cancelled = false;

    async function runExchange() {
      try {
        await authApi.exchangeTokens();

        if (cancelled) return;

        // Show a quick success state, then reload to reinit auth with fresh tokens.
        setStatus('success');
        setTimeout(() => {
          if (!cancelled) {
            window.location.replace('/');
          }
        }, 200);
      } catch (err) {
        if (cancelled) return;

        clearTokens();
        const message =
          err instanceof ApiError ? err.message : 'Authentication failed. Please try again.';
        setError(message);
        setStatus('pending');
      }
    }

    // Only try exchange if we have a provider hint (arrived from OAuth/magic link)
    const provider = searchParams.get('provider');
    if (provider) {
      runExchange();
    } else {
      navigate('/login', { replace: true });
    }

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-6 text-center">
        <div className="mb-4 text-lg font-semibold">
          {status === 'success' ? 'Signed in!' : 'Completing sign-in…'}
        </div>
        {error ? (
          <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : status === 'success' ? (
          <div className="rounded border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
            Redirecting…
          </div>
        ) : (
          <div className="text-sm text-gray-600">Please wait while we finish signing you in.</div>
        )}
      </div>
    </div>
  );
}