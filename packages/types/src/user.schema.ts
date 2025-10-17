import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().cuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

export type CreateUser = z.infer<typeof CreateUserSchema>;
