import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Input } from "@repo/design-system";
import { useAuth } from "../contexts/AuthContext";
import { useAuthForm } from "../hooks/useAuthForm";

export default function Login() {
  const [searchParams] = useSearchParams();
  const { loginWithGoogle, authError } = useAuth();
  const {
    email,
    password,
    confirmPassword,
    isLoading,
    error,
    magicLinkSent,
    setEmail,
    setPassword,
    setConfirmPassword,
    setError,
    handleLogin,
    handleRegister,
    handleMagicLink,
    resetForm,
  } = useAuthForm();

  const [isDark, setIsDark] = useState(true);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [step, setStep] = useState<"initial" | "password">("initial");

  // Check URL params for mode on mount
  useEffect(() => {
    const modeParam = searchParams.get("mode");
    if (modeParam === "signup") {
      setMode("signup");
    }
  }, [searchParams]);

  // Display auth errors from context (e.g., OAuth errors)
  useEffect(() => {
    if (authError) {
      setError(authError);
    }
  }, [authError, setError]);

  const handleEmailContinue = () => {
    if (email) {
      setStep("password");
      setError(null);
    }
  };

  const handleBack = () => {
    setStep("initial");
    setPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const toggleMode = () => {
    setMode(mode === "signin" ? "signup" : "signin");
    setStep("initial");
    resetForm();
  };

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter") {
      action();
    }
  };

  // Custom button component matching the design
  const CustomButton = ({
    children,
    onClick,
    variant = "primary",
    disabled = false,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: "primary" | "toggle";
    disabled?: boolean;
  }) => {
    const baseStyles = "w-full text-sm py-3 px-4 border transition-colors";
    const toggleStyles = "text-xs py-2 px-3 border transition-colors";

    if (variant === "toggle") {
      return (
        <button
          type="button"
          onClick={onClick}
          className={`${toggleStyles} ${
            isDark
              ? "border-white hover:bg-white hover:text-black"
              : "border-black hover:bg-black hover:text-white"
          }`}
        >
          {children}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${
          isDark
            ? "border-white hover:bg-white hover:text-black disabled:opacity-50"
            : "border-black hover:bg-black hover:text-white disabled:opacity-50"
        }`}
      >
        {children}
      </button>
    );
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center p-8 font-mono ${
        isDark ? "bg-black text-white" : "bg-white text-black"
      }`}
    >
      {/* Theme toggle - fixed to top right of screen */}
      <div className="fixed top-8 right-8">
        <CustomButton onClick={() => setIsDark(!isDark)} variant="toggle">
          {isDark ? "☀" : "☾"}
        </CustomButton>
      </div>

      <div className="w-full max-w-md relative">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="text-2xl mb-2">SuperBasic Finance</div>
          <div
            className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
          >
            No charts. No clutter. Just your money — in plain text.
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div
            className={`mb-6 p-4 border ${
              isDark
                ? "border-red-400 text-red-400"
                : "border-red-600 text-red-600"
            }`}
          >
            {error}
          </div>
        )}

        {/* Magic link sent message */}
        {magicLinkSent && (
          <div
            className={`mb-6 p-4 border ${
              isDark
                ? "border-green-400 text-green-400"
                : "border-green-600 text-green-600"
            }`}
          >
            Check your email! We sent you a magic link to sign in.
          </div>
        )}

        {/* Initial step */}
        {step === "initial" && (
          <div>
            {/* OAuth button */}
            <div className="space-y-3 mb-6">
              <CustomButton onClick={loginWithGoogle}>
                {mode === "signin" ? "Sign in" : "Sign up"} with Google
              </CustomButton>
            </div>

            {/* Divider */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div
                  className={`w-full border-t ${
                    isDark ? "border-gray-700" : "border-gray-300"
                  }`}
                />
              </div>
              <div className="relative flex justify-center text-xs">
                <span
                  className={`px-2 ${
                    isDark ? "bg-black text-gray-400" : "bg-white text-gray-600"
                  }`}
                >
                  or
                </span>
              </div>
            </div>

            {/* Email input */}
            <div className="mb-4">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => handleKeyPress(e, handleEmailContinue)}
                placeholder="Email"
                isDark={isDark}
              />
            </div>

            {/* Continue button */}
            <div className="mb-6">
              <CustomButton onClick={handleEmailContinue}>
                Continue
              </CustomButton>
            </div>

            {/* Toggle mode */}
            <div className="text-center">
              <button
                type="button"
                onClick={toggleMode}
                className="text-xs underline"
              >
                {mode === "signin"
                  ? "First time? Create account"
                  : "Already have an account? Sign in"}
              </button>
            </div>

            {/* Terms */}
            <div
              className={`text-xs mt-8 text-center ${
                isDark ? "text-gray-400" : "text-gray-600"
              }`}
            >
              By continuing, you agree to our Terms of Service and Privacy
              Policy
            </div>
          </div>
        )}

        {/* Password step - Sign in */}
        {step === "password" && mode === "signin" && (
          <div>
            <button
              type="button"
              onClick={handleBack}
              className="text-xs underline mb-8"
            >
              ← Back
            </button>

            <div className="text-sm mb-6">{email}</div>

            <div className="mb-4">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => handleKeyPress(e, handleLogin)}
                placeholder="Password"
                autoFocus
                isDark={isDark}
              />
            </div>

            <div className="mb-6">
              <CustomButton onClick={handleLogin} disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign in"}
              </CustomButton>
            </div>

            {/* Divider */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div
                  className={`w-full border-t ${
                    isDark ? "border-gray-700" : "border-gray-300"
                  }`}
                />
              </div>
              <div className="relative flex justify-center text-xs">
                <span
                  className={`px-2 ${
                    isDark ? "bg-black text-gray-400" : "bg-white text-gray-600"
                  }`}
                >
                  or
                </span>
              </div>
            </div>

            {/* Magic link option */}
            <div className="mb-6">
              <CustomButton onClick={handleMagicLink} disabled={isLoading}>
                {isLoading ? "Sending..." : "Send login link"}
              </CustomButton>
            </div>

            <div
              className={`text-xs mb-6 ${
                isDark ? "text-gray-400" : "text-gray-600"
              }`}
            >
              We'll email you a secure link. No password needed.
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="text-xs underline"
              >
                First time? Create account
              </button>
            </div>
          </div>
        )}

        {/* Password step - Sign up */}
        {step === "password" && mode === "signup" && (
          <div>
            <button
              type="button"
              onClick={handleBack}
              className="text-xs underline mb-8"
            >
              ← Back
            </button>

            <div className="text-sm mb-6">{email}</div>

            <div className="mb-4">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
                isDark={isDark}
              />
            </div>

            <div className="mb-4">
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => handleKeyPress(e, handleRegister)}
                placeholder="Retype password"
                isDark={isDark}
              />
            </div>

            <div className="mb-6">
              <CustomButton onClick={handleRegister} disabled={isLoading}>
                {isLoading ? "Creating account..." : "Create account"}
              </CustomButton>
            </div>

            {/* Divider */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div
                  className={`w-full border-t ${
                    isDark ? "border-gray-700" : "border-gray-300"
                  }`}
                />
              </div>
              <div className="relative flex justify-center text-xs">
                <span
                  className={`px-2 ${
                    isDark ? "bg-black text-gray-400" : "bg-white text-gray-600"
                  }`}
                >
                  or
                </span>
              </div>
            </div>

            {/* Magic link option */}
            <div className="mb-6">
              <CustomButton onClick={handleMagicLink} disabled={isLoading}>
                {isLoading ? "Sending..." : "Send login link"}
              </CustomButton>
            </div>

            <div
              className={`text-xs mb-6 ${
                isDark ? "text-gray-400" : "text-gray-600"
              }`}
            >
              We'll email you a secure link. No password needed.
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="text-xs underline"
              >
                Already have an account? Sign in
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
