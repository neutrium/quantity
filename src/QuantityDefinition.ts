import { Decimal } from "@neutrium/decimal";

/**
 * Scalar and normalized unit tokens produced by a parser or accepted by Quantity.
 *
 * Tokens are internal identifiers such as `<meter>`, not user-facing aliases like
 * `m`. Prefixes are separate tokens, and repeated units represent powers.
 * Use a bundled parser to generate definitions rather than maintaining token names.
 *
 * @remarks This supporting interface is not exported from a public package entry
 * point. TypeScript accepts a structurally matching object without importing it.
 * Arrays may be shared with a constructed quantity; do not mutate them afterward.
 *
 * @example
 * ```ts
 * import { Quantity } from '@neutrium/quantity';
 * import { NearleyQtyParser } from '@neutrium/quantity/parsers.js';
 *
 * const definition = new NearleyQtyParser().parse('2 m/s');
 * const speed = new Quantity(definition);
 * speed.units(); // "m/s"
 * ```
 */
export interface QuantityDefinition
{
	/** Numerical value in the specified units. */
	scalar: Decimal,		// The numerical value of the quantity
	/** Normalized numerator tokens, such as `<meter>`. */
	numerator: string[]		// The units numerator - An array of unit tokens
	/** Normalized denominator tokens; `<1>` represents unity. */
	denominator: string[]	// The units denominator - An array of unit tokens
}
