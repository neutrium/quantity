import type { Decimal } from '@neutrium/decimal';

export type FactorValue = number | string | bigint | Decimal;
/** Ratios retain their exact operands instead of storing an import-time quotient. */
export type ScaleFactor = FactorValue | readonly [FactorValue, FactorValue];
