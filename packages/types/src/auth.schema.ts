import { z } from 'zod';

// Registration schema with email, password (min 8 chars), optional name
export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

// Login schema with email and password
export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// User schema for API responses (without sensitive fields)
export const UserResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  createdAt: z.string(),
});

export type UserResponse = z.infer<typeof UserResponseSchema>;
