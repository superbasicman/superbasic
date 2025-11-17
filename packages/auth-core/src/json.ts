import type { Prisma } from '@repo/database';

export function toJsonInput(value: Record<string, unknown>): Prisma.InputJsonValue;
export function toJsonInput(
  value?: Record<string, unknown> | null
): Prisma.InputJsonValue | undefined;
export function toJsonInput(
  value?: Record<string, unknown> | null
): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return value as Prisma.InputJsonValue;
}
