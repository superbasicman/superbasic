import { z } from 'zod';

export const AuthSessionSchema = z.object({
  accessToken: z.string().min(1, 'accessToken is required'),
  sessionId: z.string().min(1, 'sessionId is required'),
  user: z.object({
    id: z.string().min(1, 'user.id is required'),
    email: z.string().email().nullable().optional(),
    name: z.string().nullable().optional(),
  }),
});

export type AuthSession = z.infer<typeof AuthSessionSchema>;

export function parseAuthSession(session: unknown): AuthSession {
  return AuthSessionSchema.parse(session);
}
