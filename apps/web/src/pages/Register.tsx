import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Register page - redirects to Login page in sign-up mode
 * Registration is handled in Login.tsx via sign-up mode
 */
export default function Register() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to login page with signup mode
    navigate('/login?mode=signup', { replace: true });
  }, [navigate]);

  return null;
}
