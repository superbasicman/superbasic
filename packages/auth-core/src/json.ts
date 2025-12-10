// import type { Prisma } from '@repo/database';

export type InputJsonValue = string | number | boolean | InputJsonObject | InputJsonArray | null;

export type InputJsonObject = { [Key in string]?: InputJsonValue };
export type InputJsonArray = InputJsonValue[];

export function toJsonInput(value: Record<string, unknown>): InputJsonObject;
export function toJsonInput(value?: Record<string, unknown> | null): InputJsonObject | undefined;
export function toJsonInput(value?: Record<string, unknown> | null): InputJsonObject | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return value as unknown as InputJsonObject;
}
