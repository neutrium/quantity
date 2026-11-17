import { parseExponent, exponentSign, absExponent, negateExponent } from '../operations/exponents.js';
import type { CacheScope } from '../utils/CacheScope.js';
import type { ArithmeticAdapter } from '@neutrium/math/numeric/arithmetic';
import { BudgetCache, WeakCacheRegistry } from '@neutrium/utilities/cache';
import { unitPlanBytes, copyCacheText } from '../utils/cache-memory.js';
import { parserConfig, type ParserConfigInput, type ParserConfig, type ParserCacheStats } from './ParserConfig.js';


import type { QuantityDefinition, UnitPower, UnitStructure } from "../QuantityDefinition.js";
import { UnitTokenManager } from '../UnitTokenManager.js'
import { temperatureChecks } from '../operations/temperature-units.js';
import { completeUnitStructure } from '../operations/unit-powers.js';

type UnitPlan = UnitStructure & { [temperatureChecks]?: string };

function createCache(config: ParserConfig): BudgetCache<UnitPlan>
{
	return new BudgetCache(config.cache, { detachKey: copyCacheText, measure: plan => unitPlanBytes(plan.numerator) + unitPlanBytes(plan.denominator) });
}

/**
 * Regex parser for scalar and unit expressions without parenthesized grouping.
 * Receives the numeric adapter explicitly; importing this engine does not load Decimal.
 * Powers bind first, then dot products; * / and whitespace evaluate left to right.
 */
export class RegexParser
{
	private static readonly caches = new WeakCacheRegistry(createCache);
	private readonly options: ParserConfig;

	/** Immutable effective parser settings. */
	get config(): ParserConfig
	{
		return this.options;
	}

	/** Estimated retention for the cache shared by this configuration. */
	get cacheStats(): ParserCacheStats
	{
		return RegexParser.caches.peek(this.options)?.stats ?? Object.freeze({ ...this.options.cache, entries: 0, estimatedBytes: 0 });
	}

	/** Release all plans shared by this parser configuration. */
	clearCache(): void
	{
		RegexParser.caches.peek(this.options)?.clear();
	}

	private get cache(): BudgetCache<UnitPlan> | undefined
	{
		return this.options.cache.maxEntries && this.options.cache.maxBytes ? RegexParser.caches.get(this.options) : undefined;
	}

	private static UNIT_MATCH_REGEX: RegExp;
	private static readonly UNIT_SEPARATOR_REGEX = /(?:\s*([.*/])\s*|\s+)/y;

	// Capture sign, unsigned scalar, and units separately. Whitespace after a
	// sign remains accepted without stripping whitespace or '+' from each scalar.
	private static readonly QTY_STRING_REGEX = /^(?:([+-]?)\s*((?:\d+(?:\.\d+)?|\.\d+)(?:[Ee][+-]?\d+)?))?\s*([\s\S]*)$/;

	/**
	 * Create a parser with optional cache limits.
	 * Omitted options share the default configuration. Separately supplied option
	 * objects isolate retention; passing an already resolved configuration reuses it.
	 * @example
	 * ```ts
	 * const parser = new RegexParser({ cache: { maxEntries: 128 } });
	 * parser.config.cache.maxEntries; // 128
	 * ```
	 */
	constructor(config?: ParserConfigInput)
	{
		this.options = parserConfig(config);

		if (!RegexParser.UNIT_MATCH_REGEX)
		{
			this.initialize();
		}
	}

	/** Rebuild shared unit patterns and clear unit caches across all Regex parser configurations. Called automatically on first construction; ordinary parsing does not require this method. */
	initialize(): void
	{
		const tokenMapper = UnitTokenManager.instance;
		const prefixes = tokenMapper.aliasPattern('prefix');
		const units = tokenMapper.aliasPattern('unit');
		// Sticky matching consumes one unit and its exponent, never repeated copies.
		RegexParser.UNIT_MATCH_REGEX = new RegExp(
			`(${prefixes})??(${units})(?:(?:\\^|\\*\\*)([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+-]?\\d+)?|\\(\\s*[+-]?\\d+\\s*/\\s*[+-]?\\d+\\s*\\))|([+-]?\\d+))?(?=\\s|[*.\/]|$)`, 'y');
		// Drop every configured scope without retaining an iterable registry of parsers.
		RegexParser.caches.clear();
	}

	/**
	 * Parse a scalar and counted units without expanding powers.
	 * @param val - Expression such as `"2 kg*m/s^2"`, `"m"`, or `"2"`.
	 * @param Numeric - Adapter used to evaluate the scalar.
	 * @param scope - Optional Quantity cache scope; wrappers should forward it unchanged.
	 * @param scalar - Optional replacement scalar. The parser validates the units and skips scalar evaluation.
	 * @returns A definition accepted by Quantity. Empty sides represent unity.
	 * @throws If syntax, unit tokens, or rational exponents are invalid.
	 * @remarks Grouped expressions and scalar arithmetic require Nearley or Pratt.
	 * Absolute-zero validation occurs when a Quantity is constructed from the definition.
	 * @example
	 * ```ts
	 * import { Quantity } from '@neutrium/quantity/number';
	 * const parsed = new RegexParser().parse('2 m/s', new Quantity(1).numeric);
	 * parsed.scalar; // 2
	 * new Quantity(parsed).units(); // "m/s"
	 * ```
	 */
	parse<T>(val: string, Numeric: ArithmeticAdapter<T>, scope?: CacheScope, scalar?: T): QuantityDefinition<T>
	{
		val = String(val).trim();
		const result = val && RegexParser.QTY_STRING_REGEX.exec(val);

		if (!result)
		{
			throw new Error('Quantity not recognized');
		}

		if (scalar === undefined)
		{
			const scalarText = result[1] === '-' ? '-' + result[2] : result[2] ?? '1';
			scalar = Numeric.from(scalarText);
		}
		const units = this.parseUnits(result[3].trim(), scope?.enabled('parser') !== false);

		return { scalar, ...units };
	}

	private parseUnits(units: string, enabled: boolean): UnitPlan
	{
		const cache = enabled ? this.cache : undefined;
		const cached = cache?.get(units);

		if (cached)
		{
			return cached;
		}

		const tokenMapper = UnitTokenManager.instance;
		const num: UnitPower[] = [], den: UnitPower[] = [];
		let cursor = 0;
		let divide = false;
		let temperatureError: string | undefined;

		// The scalar has already been removed, leaving /m in inputs such as 2/m.
		if (units.startsWith('/'))
		{
			cursor = /^\/\s*/.exec(units)![0].length;
			divide = true;

			if (cursor === units.length)
			{
				throw new Error('Unit not recognized');
			}
		}

		while (cursor < units.length)
		{
			RegexParser.UNIT_MATCH_REGEX.lastIndex = cursor;
			const match = RegexParser.UNIT_MATCH_REGEX.exec(units);

			if (!match)
			{
				throw new Error('Unit not recognized');
			}

			// A bare 1 followed by compact digits is a numeric operand, as in m/10.
			if (!match[1] && match[2] === '1' && match[4] !== undefined)
			{
				throw new Error('Scalar arithmetic requires Nearley or Pratt');
			}

			// If the prefix is itself a unit, its trailing 1 is a compact exponent.
			// Backtracking to prefixed unity must not admit a second power.
			if (match[2] === '1' && (match[3] !== undefined || match[4] !== undefined) && match[1] && tokenMapper.getUnitToken(match[1]))
			{
				throw new Error('A unit cannot have two exponents');
			}

			cursor += match[0].length;

			const unit = tokenMapper.getUnitToken(match[2]);
			const prefix = match[1] ? tokenMapper.getPrefixToken(match[1]) : undefined;

			if (!unit || prefix === null)
			{
				throw new Error('Unit not recognized');
			}

			const exponentText = match[3] ?? match[4];
			const power = exponentText === undefined ? 1 : parseExponent(exponentText.replace(/[()\s]/g, ''));

			if (unit.startsWith('<temp-'))
			{
				if (prefix) temperatureError ??= 'Cannot multiply by temperatures';
				else if (power !== 0 && power !== 1) temperatureError ??= 'Cannot raise absolute temperatures to powers';
			}

			const exponent = divide ? negateExponent(power) : power;

			if (exponent)
			{
				(exponentSign(exponent) > 0 ? num : den).push({
					unit,
					...(prefix ? { prefix } : {}),
					exponent: absExponent(exponent)
				});
			}

			if (cursor < units.length)
			{
				RegexParser.UNIT_SEPARATOR_REGEX.lastIndex = cursor;
				const separator = RegexParser.UNIT_SEPARATOR_REGEX.exec(units);

				if (!separator)
				{
					throw new Error('Unit not recognized');
				}

				cursor += separator[0].length;
				// A dot followed immediately by a digit belongs to a decimal, including after whitespace.
				if (separator[0].endsWith('.') && /[0-9]/.test(units[cursor] ?? ''))
				{
					throw new Error(separator[0] === '.' ? 'Fractional unit exponents require ^ or **'
						: 'Scalar arithmetic requires Nearley or Pratt');
				}
				// A dot continues the current tightly bound product. A slash divides
				// by the whole next dot product; * or whitespace starts a numerator product.
				if (separator[1] !== '.')
				{
					divide = separator[1] === '/';
				}

				if (cursor === units.length)
				{
					throw new Error('Unit not recognized');
				}
			}
		}

		const result: UnitPlan = completeUnitStructure(num, den);
		if (temperatureError)
		{
			result[temperatureChecks] = temperatureError;
		}

		// Bound retention when applications parse many distinct large powers.
		cache?.set(units, result);

		return result;
	}
}

export type { ParserConfigInput, ParserConfig, ParserCacheStats, ParserCacheConfigInput } from './ParserConfig.js';
