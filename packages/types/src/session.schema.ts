import { z } from 'zod';

export const SessionResponseSchema = z.object({
  id: z.string(),
  clientType: z.string(),
  kind: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  expiresAt: z.string(),
  absoluteExpiresAt: z.string(),
  ipAddress: z.string().nullable(),
  deviceName: z.string().nullable(),
  userAgent: z.string().nullable(),
  mfaLevel: z.string().nullable(),
  isCurrent: z.boolean(),
});

export const ListSessionsResponseSchema = z.object({
  sessions: z.array(SessionResponseSchema),
});

export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type ListSessionsResponse = z.infer<typeof ListSessionsResponseSchema>;
