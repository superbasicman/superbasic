import { TouchableOpacity, Text, ActivityIndicator, type TouchableOpacityProps } from 'react-native';
import { type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';

interface ButtonProps extends Omit<TouchableOpacityProps, 'children'> {
  children: ReactNode;
  variant?: ButtonVariant;
  isLoading?: boolean;
  fullWidth?: boolean;
}

const variantStyles = {
  primary: {
    container: 'bg-blue-600 active:bg-blue-700',
    text: 'text-white',
    disabled: 'bg-blue-400',
  },
  secondary: {
    container: 'bg-gray-700 active:bg-gray-600',
    text: 'text-white',
    disabled: 'bg-gray-500',
  },
  outline: {
    container: 'bg-transparent border-2 border-gray-700 active:border-gray-600',
    text: 'text-gray-200',
    disabled: 'border-gray-600',
  },
  ghost: {
    container: 'bg-transparent active:bg-gray-800',
    text: 'text-gray-200',
    disabled: 'bg-transparent',
  },
};

export function Button({
  children,
  variant = 'primary',
  isLoading = false,
  fullWidth = false,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const styles = variantStyles[variant];
  const isDisabled = disabled || isLoading;

  return (
    <TouchableOpacity
      disabled={isDisabled}
      className={`
        rounded-lg px-6 py-4 flex-row items-center justify-center
        ${fullWidth ? 'w-full' : ''}
        ${isDisabled ? styles.disabled : styles.container}
        ${className || ''}
      `.trim()}
      activeOpacity={0.8}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'primary' ? '#ffffff' : '#d1d5db'} size="small" />
      ) : (
        <Text className={`text-base font-semibold ${styles.text}`}>
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
}
