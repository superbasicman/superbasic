import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Register page - redirects to Login page
 * Registration is handled in Login.tsx via sign-up mode
 */
export default function Register() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to login page (which handles both sign-in and sign-up)
    navigate('/login', { replace: true });
  }, [navigate]);

  return null;
}
