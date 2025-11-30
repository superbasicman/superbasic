import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'success' | 'redirect'>('pending');
  const { completeProviderLogin } = useAuth();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) {
      return;
    }
    ranRef.current = true;

    const provider = searchParams.get('provider');

    async function complete() {
      if (!provider) {
        navigate('/login', { replace: true });
        return;
      }

      try {
        await completeProviderLogin();
        setStatus('success');
        navigate('/', { replace: true });
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : 'Unable to complete sign-in. Please try again.';
        setError(message);
        setStatus('redirect');
        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 1200);
      }
    }

    complete();
  }, [navigate, searchParams, completeProviderLogin]);

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
          <div className="rounded border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            Please wait while we finish signing you in.
          </div>
        )}
      </div>
    </div>
  );
}
