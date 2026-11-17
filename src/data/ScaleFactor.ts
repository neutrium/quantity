export type FactorValue = number | string | bigint;
/** Ratios retain their exact operands instead of storing an import-time quotient. */
export type ScaleFactor = FactorValue | readonly [FactorValue, FactorValue];
