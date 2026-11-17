import type { Decimal } from "@neutrium/decimal";

/** Exact fractional power. Normalized values are reduced and have a positive denominator. */
export type RationalExponent = import('@neutrium/math/numeric/fractions').RationalFraction;

/** Safe integers use numbers; fractions use exact, immutable rational records. */
export type UnitExponent = number | RationalExponent;

/** One distinct unit, optionally prefixed, raised to a positive rational power. */
export interface UnitPower
{
	/** Internal unit identifier, such as `<meter>`. */
	readonly unit: string;
	/** Internal prefix identifier, such as `<kilo>`. Omit for unprefixed units. */
	readonly prefix?: string;
	/** Positive safe integer or exact fraction; negative powers belong in the denominator. */
	readonly exponent: UnitExponent;
}

/**
 * Counted numerator and denominator units without a numerical scalar.
 * Import from `@neutrium/quantity/factory`. Empty arrays represent unity.
 * Arrays and records are read-only; external definitions may replace either side.
 * Quantity construction validates and freezes externally supplied unit records.
 */
export interface UnitStructure
{
	/** Counted numerator units. */
	numerator: readonly UnitPower[];
	/** Counted denominator units. */
	denominator: readonly UnitPower[];
}

/**
 * Scalar and counted units produced by a parser or accepted by Quantity.
 * Import from `@neutrium/quantity/factory`. Empty arrays represent unity.
 * Construction copies and freezes external unit records; duplicate records on
 * each side are coalesced without expanding exponents into repeated tokens.
 * The scalar must already belong to the destination backend. Definitions carry
 * no source adapter; use an existing Quantity for cross-backend construction.
 *
 * @example
 * ```ts
 * import { Quantity } from '@neutrium/quantity/number';
 *
 * const area = new Quantity({
 *   scalar: 2,
 *   numerator: [{ unit: '<meter>', prefix: '<kilo>', exponent: 2 }],
 *   denominator: []
 * });
 * area.units(); // "km2"
 * ```
 */
export interface QuantityDefinition<T = Decimal> extends UnitStructure
{
	/** Numerical value in the specified units. */
	scalar: T;
}
