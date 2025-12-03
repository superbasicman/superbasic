import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'success' | 'redirect'>('pending');
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) {
      return;
    }
    ranRef.current = true;

    const message =
      'Legacy provider callback is no longer supported. Please restart login from the dashboard.';
    setError(message);
    setStatus('redirect');
    setTimeout(() => {
      navigate('/login', { replace: true });
    }, 1200);
  }, [navigate]);

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
