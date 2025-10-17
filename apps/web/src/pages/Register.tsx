import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@repo/design-system';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../lib/api';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Field-level validation errors
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordConfirmationError, setPasswordConfirmationError] = useState<string | null>(null);

  const validateEmail = (value: string): boolean => {
    if (!value) {
      setEmailError('Email is required');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      setEmailError('Invalid email address');
      return false;
    }
    setEmailError(null);
    return true;
  };

  const validatePassword = (value: string): boolean => {
    if (!value) {
      setPasswordError('Password is required');
      return false;
    }
    if (value.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return false;
    }
    setPasswordError(null);
    return true;
  };

  const validatePasswordConfirmation = (value: string): boolean => {
    if (!value) {
      setPasswordConfirmationError('Please confirm your password');
      return false;
    }
    if (value !== password) {
      setPasswordConfirmationError('Passwords do not match');
      return false;
    }
    setPasswordConfirmationError(null);
    return true;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Validate all fields
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    const isPasswordConfirmationValid = validatePasswordConfirmation(passwordConfirmation);

    if (!isEmailValid || !isPasswordValid || !isPasswordConfirmationValid) {
      return;
    }

    setIsLoading(true);

    try {
      // Register and auto-login
      await register({
        email,
        password,
        name: name || undefined, // Send undefined if empty
      });
      // Redirect to dashboard on success
      navigate('/');
    } catch (err) {
      // Display field-level validation errors from API
      if (err instanceof ApiError) {
        if (err.details) {
          // Map API validation errors to field-level errors
          if (err.details.email && err.details.email[0]) {
            setEmailError(err.details.email[0]);
          }
          if (err.details.password && err.details.password[0]) {
            setPasswordError(err.details.password[0]);
          }
          if (err.details.name) {
            // Name errors would go here if we had validation
          }
          // Show generic error if there are unmapped fields
          if (!err.details.email && !err.details.password) {
            setError(err.message);
          }
        } else {
          setError(err.message);
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link
              to="/login"
              className="font-medium text-primary-600 hover:text-primary-500"
            >
              sign in to existing account
            </Link>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {/* Global error message */}
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">{error}</h3>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4 rounded-md shadow-sm">
            {/* Email field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) validateEmail(e.target.value);
                }}
                onBlur={(e) => validateEmail(e.target.value)}
                className={`mt-1 block w-full appearance-none rounded-md border ${
                  emailError ? 'border-red-300' : 'border-gray-300'
                } px-3 py-2 placeholder-gray-400 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm`}
                placeholder="you@example.com"
              />
              {emailError && (
                <p className="mt-1 text-sm text-red-600">{emailError}</p>
              )}
            </div>

            {/* Name field (optional) */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Name (optional)
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                placeholder="John Doe"
              />
            </div>

            {/* Password field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) validatePassword(e.target.value);
                  // Re-validate confirmation if it's already filled
                  if (passwordConfirmation) {
                    validatePasswordConfirmation(passwordConfirmation);
                  }
                }}
                onBlur={(e) => validatePassword(e.target.value)}
                className={`mt-1 block w-full appearance-none rounded-md border ${
                  passwordError ? 'border-red-300' : 'border-gray-300'
                } px-3 py-2 placeholder-gray-400 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm`}
                placeholder="••••••••"
              />
              {passwordError && (
                <p className="mt-1 text-sm text-red-600">{passwordError}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Must be at least 8 characters
              </p>
            </div>

            {/* Password confirmation field */}
            <div>
              <label
                htmlFor="passwordConfirmation"
                className="block text-sm font-medium text-gray-700"
              >
                Confirm password
              </label>
              <input
                id="passwordConfirmation"
                name="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                required
                value={passwordConfirmation}
                onChange={(e) => {
                  setPasswordConfirmation(e.target.value);
                  if (passwordConfirmationError) validatePasswordConfirmation(e.target.value);
                }}
                onBlur={(e) => validatePasswordConfirmation(e.target.value)}
                className={`mt-1 block w-full appearance-none rounded-md border ${
                  passwordConfirmationError ? 'border-red-300' : 'border-gray-300'
                } px-3 py-2 placeholder-gray-400 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm`}
                placeholder="••••••••"
              />
              {passwordConfirmationError && (
                <p className="mt-1 text-sm text-red-600">{passwordConfirmationError}</p>
              )}
            </div>
          </div>

          <div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
