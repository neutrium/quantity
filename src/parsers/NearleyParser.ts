import type { CacheScope } from '../utils/CacheScope.js';

import type { ArithmeticAdapter } from '@neutrium/utilities/numeric/arithmetic';
import { BudgetCache, WeakCacheRegistry } from '@neutrium/utilities/cache';
import { unitPlanBytes, copyCacheText } from '../utils/cache-memory.js';
import { parserConfig, parserScope, type ParserConfigInput, type ParserConfig, type ParserCacheStats } from './ParserConfig.js';
import Nearley from 'nearley';
import grammar, { lexer as lexerTemplate } from './qty-grammar.js';
import type { QuantityDefinition, UnitStructure } from '../QuantityDefinition.js';
import { resolveUnitExpression, type QuantityExpression } from './unit-expression.js';
import { compileScalar, evaluateScalar, type ScalarProgram } from './scalar-expression.js';
import { PreparedExpression } from './PreparedExpression.js';
import { QuantityParseError, type QuantityParseResult } from './QuantityParseError.js';
import { incompleteExpression, parsingError } from './nearley-diagnostics.js';

export { QuantityParseError, type QuantityParseErrorCode, type QuantityParseResult } from './QuantityParseError.js';

type ExpressionPlan = UnitStructure & { scalar: ScalarProgram };

function createCache(config: ParserConfig): BudgetCache<ExpressionPlan>
{
	return new BudgetCache(config.cache, {
		detachKey: copyCacheText,
		measure: plan => {
			let bytes = unitPlanBytes(plan.numerator) + unitPlanBytes(plan.denominator) + 64;

			for (const instruction of plan.scalar)
			{
				bytes += 96 + ('text' in instruction ? 40 + 2 * instruction.text.length : 0);
			}

			return bytes;
		},
		detach: plan => ({
			...plan,
			scalar: plan.scalar.map(instruction => 'text' in instruction ? { ...instruction, text: copyCacheText(instruction.text) } : instruction)
		}),
	});
}

/**
 * Parser for scalar products/division, compound units, powers, and nested groups.
 * Powers bind first, then dot products; * / and whitespace evaluate left to right.
 * Compiled expression plans are shared within a configuration; scalar evaluation follows
 * the original operation order and the selected numeric adapter on every call.
 */
export class NearleyParser
{
	private static compiledGrammar: ReturnType<typeof Nearley.Grammar.fromCompiled>;
	private static readonly caches = new WeakCacheRegistry(createCache);
	private readonly options: ParserConfig;

	/**
	 * Create a parser with optional cache limits.
	 * Omitted options share the default configuration. Separately supplied option
	 * objects isolate retention; passing an already resolved configuration reuses it.
	 * @example
	 * ```ts
	 * const parser = new NearleyParser({ cache: { maxEntries: 128 } });
	 * parser.config.cache.maxEntries; // 128
	 * ```
	 */
	constructor(config?: ParserConfigInput)
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
		return this.cache?.stats ?? Object.freeze({ ...this.options.cache, entries: 0, estimatedBytes: 0 });
	}

	/** Release expression plans shared by this configuration; does not clear token or Quantity result caches. */
	clearCache(): void
	{
		this.cache?.clear();
	}

	private get cache(): BudgetCache<ExpressionPlan> | undefined
	{
		return this.options.cache.maxEntries && this.options.cache.maxBytes ? NearleyParser.caches.get(this.options) : undefined;
	}

	/**
	 * Parse and evaluate a complete scalar/unit expression.
	 * @param input - Expression supporting products, division, powers, groups,
	 * scientific notation, and Unicode multiplication/superscript notation.
	 * @param Numeric - Adapter used to evaluate scalars; supplied automatically by a configured Quantity.
	 * @param scope - Optional Quantity cache scope; wrappers should forward it unchanged.
	 * @returns A fresh definition with a backend scalar and frozen counted units.
	 * Unit arrays may be shared with cached plans.
	 * @throws {@link QuantityParseError} for invalid or incomplete syntax, unknown
	 * units, invalid exponents, and scalar-evaluation failures.
	 * @remarks Physical checks such as absolute zero belong to Quantity construction.
	 * @example
	 * ```ts
	 * import { NearleyParser } from '@neutrium/quantity/parsers/nearley';
	 * import { NumberAdapter } from '@neutrium/utilities/number';
	 * const numberAdapter = new NumberAdapter();
	 *
	 * const parsed = new NearleyParser().parse('1/2 m', numberAdapter);
	 * parsed.scalar; // 0.5
	 * ```
	 */
	public parse<T>(input: string, Numeric: ArithmeticAdapter<T>, scope?: CacheScope): QuantityDefinition<T>
	{
		if (typeof input !== 'string')
		{
			throw new QuantityParseError('INVALID_INPUT', '', 0, 'Expected a string');
		}

		let prepared: PreparedExpression | undefined;
		let parser: Nearley.Parser | undefined;

		try
		{
			scope ??= parserScope(this.options);
			const cache = scope.enabled('parser') ? this.cache : undefined;
			// Explicit parsers retain their own plan/token limits; the receiver can
			// disable both without altering the parser or its standalone use.
			const parsingScope = scope.enabled('parser') ? parserScope(this.options) : scope;
			prepared = new PreparedExpression(lexerTemplate.clone(), input, parsingScope);
			let plan = cache?.get(prepared.key);
			const cached = plan !== undefined;

			if (!plan)
			{
				const compiled = NearleyParser.compiledGrammar ??= Nearley.Grammar.fromCompiled({
					...grammar, Lexer: undefined,
				});
				parser = new Nearley.Parser(compiled, { lexer: prepared });
				parser.feed(input);

				if (!parser.results.length)
				{
					throw incompleteExpression(input, prepared, parser);
				}

				if (parser.results.length !== 1)
				{
					throw new QuantityParseError('AMBIGUOUS_EXPRESSION', input, 0, 'Expression has more than one interpretation');
				}

				const expression = parser.results[0] as QuantityExpression;

				plan = { scalar: compileScalar(expression.scalar), ...resolveUnitExpression(expression.units) };
			}
			// Cache only successful plans, never evaluated scalars: evaluation may
			// depend on the leading input, rounding configuration, or operation order.
			const scalar = evaluateScalar(plan.scalar, prepared.scalar, Numeric);

			if (!cached)
			{
				cache?.set(prepared.key, plan);
			}

			return {
				scalar,
				numerator: plan.numerator,
				denominator: plan.denominator
			};
		}
		catch (error)
		{
			throw parsingError(error, input, prepared, parser);
		}
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
	 * import { Quantity } from '@neutrium/quantity/number';
	 * const result = new NearleyParser().tryParse('kg/(m*s', new Quantity(1).numeric);
	 * if (!result.success) {
	 *     result.error.code; // "UNEXPECTED_END"
	 *     result.error.offset; // 7 (the end of the input)
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

export type { ParserConfigInput, ParserConfig, ParserCacheStats, ParserCacheConfigInput } from './ParserConfig.js';
