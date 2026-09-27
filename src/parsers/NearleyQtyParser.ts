import { Decimal } from '@neutrium/decimal';
import type { DecimalConstructor } from '../operations/numeric-context.js';
import { BudgetCache } from '../utils/BudgetCache.js';
import { WeakCacheRegistry } from '../utils/WeakCacheRegistry.js';
import { unitPlanBytes, copyCacheText } from '../utils/cache-memory.js';
import { parserConfig, type ParserConfigInput, type ParserConfig, type ParserCacheStats } from './ParserConfig.js';
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
 * the original operation order and the current Decimal configuration on every call.
 */
export class NearleyQtyParser
{
	private static compiledGrammar: ReturnType<typeof Nearley.Grammar.fromCompiled>;
	private static readonly caches = new WeakCacheRegistry(createCache);
	private readonly options: ParserConfig;

	/** Create a parser; omitted options share the default cache, supplied options create an isolated scope. */
	constructor(config?: ParserConfigInput)
	{
		this.options = parserConfig(config);
	}
	/** Immutable effective parser settings. */
	get config(): ParserConfig
	{
		return this.options;
	}
	/** Estimated retention for the cache shared by this configuration. */
	get cacheStats(): ParserCacheStats
	{
		return this.cache.stats;
	}
	/** Release all plans shared by this parser configuration. */
	clearCache(): void
	{
		this.cache.clear();
	}

	private get cache(): BudgetCache<ExpressionPlan>
	{
		return NearleyQtyParser.caches.get(this.options);
	}

	/**
	 * Parse and evaluate a complete scalar/unit expression.
	 * @param input - Expression supporting products, division, powers, groups,
	 * scientific notation, and Unicode multiplication/superscript notation.
	 * @param Numeric - Decimal constructor for evaluation; defaults to the shared
	 * Decimal context. Quantity supplies its configured context automatically.
	 * @returns A fresh definition with a Decimal scalar and frozen counted units.
	 * Unit arrays may be shared with cached plans.
	 * @throws {@link QuantityParseError} for invalid or incomplete syntax, unknown
	 * units, invalid exponents, and scalar-evaluation failures.
	 * @remarks Physical checks such as absolute zero belong to Quantity construction.
	 * @example
	 * ```ts
	 * import { NearleyQtyParser } from '@neutrium/quantity/parsers/nearley';
	 *
	 * const parsed = new NearleyQtyParser().parse('1/2 m');
	 * parsed.scalar.toString(); // "0.5"
	 * ```
	 */
	public parse(input: string, Numeric: DecimalConstructor = Decimal): QuantityDefinition
	{
		if (typeof input !== 'string')
		{
			throw new QuantityParseError('INVALID_INPUT', '', 0, 'Expected a string');
		}

		let prepared: PreparedExpression | undefined;
		let parser: Nearley.Parser | undefined;

		try
		{
			prepared = new PreparedExpression(lexerTemplate.clone(), input);
			let plan = this.cache.get(prepared.key);
			const cached = plan !== undefined;

			if (!plan)
			{
				const compiled = NearleyQtyParser.compiledGrammar ??= Nearley.Grammar.fromCompiled({
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
				this.cache.set(prepared.key, plan);
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

	/** Non-throwing form of parse(), with the same validation and structured errors. */
	public tryParse(input: string, Numeric: DecimalConstructor = Decimal): QuantityParseResult<QuantityDefinition>
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
