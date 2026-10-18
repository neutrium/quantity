import { scalarBytes } from '../numeric/support.js';
import type { Quantity } from '../QuantityCore.js';
import type { CachePolicy } from '@neutrium/utilities/cache';
import { unitPlanBytes, copyCacheText } from '../utils/cache-memory.js';

/** Null marks the receiver itself; other values identify retained conversion results. */
export const conversionExpressionPolicy: CachePolicy<string | null> = {
	detachKey: copyCacheText,
	// Do not retain padding or normalize text that a custom parser may interpret.
	accept: expression => expression === expression.trim(),
	measure: unitKey => unitKey === null ? 0 : 2 * unitKey.length,
};

/** Quantity payload in addition to the cache's shared entry/key bookkeeping. */
export const conversionResultPolicy = {
	detachKey: copyCacheText,
	// Clamp estimates to reject oversized entries safely.
	measure: (value: Quantity<unknown>) => Math.min(Number.MAX_SAFE_INTEGER, 768 + unitPlanBytes(value.numerator) + unitPlanBytes(value.denominator) +
		scalarBytes(value.numeric, value.scalar)),
} satisfies CachePolicy<Quantity<unknown>>;
