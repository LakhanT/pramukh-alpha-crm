import { Prisma } from '@prisma/client';

/** Coerce Express req.params value to string */
export function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export function toJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}
