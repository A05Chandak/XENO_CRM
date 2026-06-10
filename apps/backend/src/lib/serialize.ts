import { Decimal } from "@prisma/client/runtime/library";

export function serialize(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Decimal) {
    return value.toNumber();
  }

  if (Array.isArray(value)) {
    return value.map(serialize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, serialize(entry)])
    );
  }

  return value;
}
