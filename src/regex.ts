import { Quantity as QuantityCore } from './QuantityCore.js';
import { RegexQtyParser } from './parsers/RegexQtyParser.js';
import type { QuantityInitParam } from './guards.js';
import type { QuantityDefinition } from './QuantityDefinition.js';
import type { Parser } from './parsers/Parser.js';

/**
 * Quantity configured with {@link RegexQtyParser}.
 * Import from `@neutrium/quantity/regex`. Values and counted units are read-only; arithmetic,
 * conversions, and clones retain the receiving class and parser.
 *
 * Use {@link withConfig} to isolate Decimal settings and configure cache budgets.
 * @example
 * ```ts
 * import { Quantity } from '@neutrium/quantity/regex';
 *
 * const PreciseQuantity = Quantity.withConfig({ precision: 30 });
 * new PreciseQuantity('2 m').to('cm').scalar.toString(); // "200"
 * ```
 */
export class Quantity extends QuantityCore
{
	/**
	 * Construct a quantity from an expression, scalar, definition, or existing quantity.
	 * @param input - Quantity expression, number, Decimal, numeric `toString()` object,
	 * or definition containing a Decimal scalar and counted unit records.
	 * @param units - Optional unit expression. Omitted or empty units make scalar
	 * inputs dimensionless. A scalar in this expression is replaced by `input`.
	 * Ignored for definitions and existing quantities.
	 * @param parser - Per-instance override; otherwise uses this class's default
	 * parser with its configured cache limits. Derived results retain the parser.
	 * @throws If input is invalid, unit counts overflow, or temperature restrictions
	 * are violated. External definition scalars must be Decimal instances.
	 * @category Construction
	 */
	constructor(input: QuantityInitParam, units?: string, parser?: Parser<QuantityDefinition>)
	{
		super(input, units, parser === undefined ? new RegexQtyParser(new.target.parserConfig) : parser);
	}
}

export type { QuantityConfigInput, CacheConfigInput, CacheConfig } from './QuantityConfig.js';
export type { ParserConfigInput, ParserConfig, ParserCacheConfigInput, ParserCacheStats } from './parsers/ParserConfig.js';
