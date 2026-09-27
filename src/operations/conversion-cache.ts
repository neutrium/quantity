import type { Quantity } from '../QuantityCore.js';
import type { CachePolicy } from '../utils/BudgetCache.js';
import { unitPlanBytes } from '../utils/cache-memory.js';

/** Null marks the receiver itself; other values identify retained conversion results. */
export const conversionExpressionPolicy: CachePolicy<string | null> = {
	// Do not retain padding or normalize text that a custom parser may interpret.
	accept: expression => expression === expression.trim(),
	measure: unitKey => unitKey === null ? 0 : 2 * unitKey.length,
};

/** Quantity payload in addition to the cache's shared entry/key bookkeeping. */
export const conversionResultPolicy: CachePolicy<Quantity> = {
	// Count digits without formatting, which can have a much smaller output limit.
	measure: value => 768 + unitPlanBytes(value.numerator) + unitPlanBytes(value.denominator) +
		(value.scalar.isFinite() ? 8 * value.scalar.precision() : 0),
};
