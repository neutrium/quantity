import type { ArithmeticAdapter } from '@neutrium/math/numeric/arithmetic';
import type { CacheScope } from '../utils/CacheScope.js';
import type { QuantityDefinition } from '../QuantityDefinition.js';
import { parserConfig, type ParserConfig, type ParserConfigInput, type ParserCacheStats } from './ParserConfig.js';
import { QuantityParseError, type QuantityParseResult } from './QuantityParseError.js';

export interface ExpressionEngine
{
	peekCache(config: ParserConfig): { readonly stats: ParserCacheStats; clear(): void } | undefined;
	parse<T>(input: string, numeric: ArithmeticAdapter<T>, config: ParserConfig, scope?: CacheScope, scalar?: T): QuantityDefinition<T>;
}

/** @internal Shared public methods for the bundled expression parsers. */
export abstract class ExpressionParser
{
	private readonly options: ParserConfig;

	protected constructor(config: ParserConfigInput | undefined, private readonly engine: ExpressionEngine)
	{
		this.options = parserConfig(config);
	}

	/** Immutable effective parser settings. */
	get config(): ParserConfig
	{
		return this.options;
	}

	/** Estimated retained expression plans and limits; excludes the separate token cache. */
	get cacheStats(): ParserCacheStats
	{
		return this.engine.peekCache(this.options)?.stats ?? Object.freeze({ ...this.options.cache, entries: 0, estimatedBytes: 0 });
	}

	/** Release expression plans shared by this configuration; does not clear token or Quantity result caches. */
	clearCache(): void
	{
		this.engine.peekCache(this.options)?.clear();
	}

	/**
	 * Parse and evaluate a complete scalar/unit expression.
	 * @param input - Expression supporting products, division, powers, groups,
	 * scientific notation, and Unicode multiplication/superscript notation.
	 * @param Numeric - Adapter used to evaluate scalars; supplied automatically by a configured Quantity.
	 * @param scope - Optional Quantity cache scope; wrappers should forward it unchanged.
	 * @param scalar - Optional replacement scalar. The parser validates the units and skips scalar evaluation.
	 * @returns A fresh definition with a backend scalar and frozen counted units.
	 * Unit arrays may be shared with cached plans.
	 * @throws {@link QuantityParseError} for invalid or incomplete syntax, unknown
	 * units, invalid exponents, and scalar-evaluation failures.
	 * @remarks Physical checks such as absolute zero belong to Quantity construction.
	 * @example
	 * ```ts
	 * import { PrattParser } from '@neutrium/quantity/parsers/pratt';
	 * import { NumberAdapter } from '@neutrium/math/adapters/number';
	 * const numberAdapter = new NumberAdapter();
	 *
	 * const parsed = new PrattParser().parse('1/2 m', numberAdapter);
	 * parsed.scalar; // 0.5
	 * ```
	 */
	public parse<T>(input: string, Numeric: ArithmeticAdapter<T>, scope?: CacheScope, scalar?: T): QuantityDefinition<T>
	{
		return this.engine.parse(input, Numeric, this.options, scope, scalar);
	}

	/**
	 * Parse without throwing for syntax or expression-evaluation failures.
	 * @param input - Complete scalar/unit expression.
	 * @param Numeric - Backend used to evaluate the scalar.
	 * @returns A definition on success, or a structured error at the original location.
	 * @remarks Like `parse`, this does not check absolute-temperature physics;
	 * construct a Quantity from the successful definition for those checks.
	 * @example
	 * ```ts
	 * import { PrattParser } from '@neutrium/quantity/parsers/pratt';
	 * import { Quantity } from '@neutrium/quantity/number';
	 * const result = new PrattParser().tryParse('kg/(m*s', new Quantity(1).numeric);
	 * if (!result.success) {
	 *     result.error.code; // "UNEXPECTED_END"
	 *     result.error.offset; // 7 (the end of the input)
	 *     result.error.expected; // [')']
	 * }
	 * ```
	 */
	public tryParse<T>(input: string, Numeric: ArithmeticAdapter<T>): QuantityParseResult<QuantityDefinition<T>>
	{
		try
		{
			return {
				success: true,
				value: this.parse(input, Numeric)
			};
		}
		catch (error)
		{
			if (error instanceof QuantityParseError)
			{
				return { success: false, error };
			}

			throw error;
		}
	}
}
