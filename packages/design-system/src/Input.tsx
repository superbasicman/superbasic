import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  isDark?: boolean;
}

export function Input({ type = 'text', isDark = false, className = '', ...props }: InputProps) {
  const baseClasses = 'w-full text-sm py-3 px-4 border focus:outline-none';
  const themeClasses = isDark
    ? 'bg-black border-white placeholder-gray-500'
    : 'bg-transparent border-black placeholder-gray-400';

  const classes = [baseClasses, themeClasses, className].filter(Boolean).join(' ');

  return <input type={type} className={classes} {...props} />;
}
