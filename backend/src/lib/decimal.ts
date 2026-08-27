// =============================================================================
// Decimal helpers — safe conversion of Prisma Decimal to plain numbers
// =============================================================================
//
// Prisma returns Decimal columns as `Prisma.Decimal` objects, not plain JS
// numbers.  The API layer must serialise them to JSON-compatible numbers.
//
// toNum()  — converts Decimal | number | null | undefined → number (0 for null)
// toNumOrNull() — converts Decimal | number | null | undefined → number | null
//
// Both handle Prisma.Decimal, raw numbers (already correct), and null/undefined.
// =============================================================================

/**
 * Convert a Prisma Decimal (or number, or null) to a plain JS number.
 * Returns 0 for null/undefined so callers never get NaN in arithmetic.
 */
export function toNum(val: unknown): number {
  if (val == null) return 0;
  // Prisma.Decimal objects have a .toNumber() method
  if (typeof val === 'object' && val !== null && 'toNumber' in val) {
    return (val as { toNumber(): number }).toNumber();
  }
  return Number(val);
}

/**
 * Convert a Prisma Decimal (or number, or null) to a plain JS number | null.
 * Preserves null for nullable columns (e.g. InventoryPriceAuditLog.oldCost).
 */
export function toNumOrNull(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === 'object' && val !== null && 'toNumber' in val) {
    return (val as { toNumber(): number }).toNumber();
  }
  return Number(val);
}
