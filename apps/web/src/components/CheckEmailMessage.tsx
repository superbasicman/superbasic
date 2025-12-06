import type { FC } from 'react';

type CheckEmailMessageProps = {
  email: string;
  isDark: boolean;
  onReset: () => void;
  onToggleTheme: () => void;
};

const CheckEmailMessage: FC<CheckEmailMessageProps> = ({
  email,
  isDark,
  onReset,
  onToggleTheme,
}) => {
  const toggleStyles = `text-xs tracking-[0.16em] uppercase border rounded-full px-4 py-1.5 opacity-70 hover:opacity-100 transition-opacity ${
    isDark
      ? 'border-white text-white hover:bg-white hover:text-black'
      : 'border-white text-white hover:bg-white hover:text-black'
  }`;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 font-mono bg-black text-white">
      <div className="fixed top-6 right-6">
        <button type="button" onClick={onToggleTheme} className={toggleStyles}>
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
      </div>

      <div className="w-full max-w-md">
        <header className="mb-10 text-left">
          <div className="text-xs uppercase tracking-[0.18em] mb-2 text-white/50">
            SuperBasic Finance
          </div>
          <h1 className="text-3xl md:text-4xl mb-4">Check your email</h1>
          <p className="text-base leading-relaxed text-white/70">
            We&apos;ve sent a verification link to your email.
          </p>
        </header>

        <section className="mb-12 text-left">
          <p className="text-xs mb-2 text-white/50">Sent to</p>
          <p className="text-base mb-4 break-words font-medium">{email}</p>
          <p className="text-sm leading-relaxed max-w-sm text-white/70">
            Open your inbox and click the link to continue.
          </p>
        </section>

        <footer>
          <button
            type="button"
            onClick={onReset}
            className="text-xs tracking-[0.16em] uppercase text-white/70 hover:text-white"
          >
            Back to sign in
          </button>
        </footer>
      </div>
    </div>
  );
};

export default CheckEmailMessage;