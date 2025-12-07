import { View, Text, TextInput, type TextInputProps } from 'react-native';
import { useState } from 'react';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({
  label,
  error,
  helperText,
  className,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View className="w-full">
      {label && (
        <Text className="text-sm font-medium text-gray-200 mb-2">
          {label}
        </Text>
      )}

      <TextInput
        className={`
          w-full px-4 py-3 rounded-lg
          bg-gray-800 text-white
          border-2
          ${error ? 'border-red-500' : isFocused ? 'border-blue-500' : 'border-gray-700'}
          ${className || ''}
        `.trim()}
        placeholderTextColor="#9ca3af"
        onFocus={(e) => {
          setIsFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          props.onBlur?.(e);
        }}
        {...props}
      />

      {error && (
        <Text className="text-sm text-red-500 mt-1">
          {error}
        </Text>
      )}

      {helperText && !error && (
        <Text className="text-sm text-gray-400 mt-1">
          {helperText}
        </Text>
      )}
    </View>
  );
}
