import type { CacheScope } from '../utils/CacheScope.js';
import type { ArithmeticAdapter } from '@neutrium/utilities/numeric/arithmetic';
import type { QuantityDefinition } from '../QuantityDefinition.js';
import type { ParserConfig } from './ParserConfig.js';

/**
 * Custom parser contract for quantities with scalar type T.
 * Return a definition using the adapter passed to `parse`; Quantity then validates
 * its scalar, units and absolute-temperature rules. A custom parser need not implement
 * the bundled expression syntax or structured errors.
 * @example
 * ```ts
 * import type { Parser } from '@neutrium/quantity/factory';
 * const scalarOnly: Parser<number> = {
 *     parse: (text, numeric) => ({
 *         scalar: numeric.from(text), numerator: [], denominator: [],
 *     }),
 * };
 * ```
 */
export interface Parser<T>
{
	/** Effective parser settings, when supported. */
	readonly config?: ParserConfig;
	/**
	 * Return a definition whose scalar is evaluated in the supplied adapter's context.
	 * @param text - Caller-supplied expression.
	 * @param numeric - Destination backend; do not capture a different adapter in the parser.
	 * @param scope - Quantity's optional cache scope. Forward it unchanged when
	 * delegating to a bundled parser so disabled-cache settings are respected.
	 */
	parse(text: string, numeric: ArithmeticAdapter<T>, scope?: CacheScope): QuantityDefinition<T>;
}
