import type { DecimalConstructor } from '../operations/numeric-context.js';
import { BudgetCache } from '../utils/BudgetCache.js';
import { WeakCacheRegistry } from '../utils/WeakCacheRegistry.js';
import { unitPlanBytes } from '../utils/cache-memory.js';
import { parserConfig, type ParserConfigInput, type ParserConfig, type ParserCacheStats } from './ParserConfig.js';
import { Decimal } from "@neutrium/decimal";
import { Parser } from './Parser.js';

import type { QuantityDefinition, UnitPower, UnitStructure } from "../QuantityDefinition.js";
import { UnitTokenManager } from '../UnitTokenManager.js'
import { checkedExponent, normalizePowers } from '../operations/unit-powers.js';

function createCache(config: ParserConfig): BudgetCache<UnitStructure>
{
	return new BudgetCache(config.cache, { measure: plan => unitPlanBytes(plan.numerator) + unitPlanBytes(plan.denominator) });
}

/**
 * Legacy parser for scalar and unit expressions without parenthesized grouping.
 * Powers bind first, then dot products; * / and whitespace evaluate from left to right.
 *
 * Import from `@neutrium/quantity/parsers.js`. Pass an instance as the third
 * argument to {@link Quantity.Quantity.constructor | Quantity constructor}, or call {@link parse} directly
 * when a parsed definition is needed.
 *
 * @example
 * ```ts
 * import { Quantity } from '@neutrium/quantity';
 * import { RegexQtyParser } from '@neutrium/quantity/parsers.js';
 *
 * const parser = new RegexQtyParser();
 * const force = new Quantity('2 kg*m/s^2', undefined, parser);
 * force.to('N').scalar.toString(); // "2"
 * ```
 */
export class RegexQtyParser implements Parser<QuantityDefinition>
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
		return this.cache.stats;
	}
	/** Release all plans shared by this parser configuration. */
	clearCache(): void
	{
		this.cache.clear();
	}

	private get cache(): BudgetCache<UnitStructure>
	{
		return RegexQtyParser.caches.get(this.options);
	}
	private static UNIT_MATCH_REGEX: RegExp;
	private static readonly UNIT_SEPARATOR_REGEX = /(?:\s*([.*/])\s*|\s+)/y;
	private tokenMapper = UnitTokenManager.instance;

	// Capture sign, unsigned scalar, and units separately. Whitespace after a
	// sign remains accepted without stripping whitespace or '+' from each scalar.
	private static readonly QTY_STRING_REGEX = /^(?:([+-]?)\s*((?:\d+(?:\.\d+)?|\.\d+)(?:[Ee][+-]?\d+)?))?\s*([\s\S]*)$/;

	/** Create a parser; supplied options isolate its cache from the default scope. */
	constructor(config?: ParserConfigInput)
	{
		this.options = parserConfig(config);

		if (!RegexQtyParser.UNIT_MATCH_REGEX)
		{
			this.initialize();
		}
	}

	/** Rebuild shared patterns and clear cached definitions after changing unit aliases. */
	initialize(): void
	{
		const alternatives = (map: Record<string, string>) => Object.keys(map)
			.sort((a, b) => b.length - a.length)
			.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
		const prefixes = alternatives(this.tokenMapper.getMap('prefix'));
		const units = alternatives(this.tokenMapper.getMap('unit'));
		// Sticky matching consumes one unit and its exponent, never repeated copies.
		RegexQtyParser.UNIT_MATCH_REGEX = new RegExp(
			`(${prefixes})??(${units})(?:(?:\\^|\\*\\*)([+-]?\\d+)|([+-]?\\d+))?(?=\\s|[*.\/]|$)`, 'y');
		// Drop every configured scope without retaining an iterable registry of parsers.
		RegexQtyParser.caches.clear();
	}

	/**
	 * Parse a scalar and counted units without expanding powers.
	 * @param val - Expression such as `"2 kg*m/s^2"`, `"m"`, or `"2"`.
	 * @param Numeric - Decimal constructor used to evaluate the scalar; defaults to shared Decimal.
	 * @returns A definition accepted by Quantity. Empty sides represent unity.
	 * @throws If syntax, unit tokens, or integer exponents are invalid.
	 */
	parse(val: string, Numeric: DecimalConstructor = Decimal): QuantityDefinition
	{
		val = String(val).trim();
		const result = val && RegexQtyParser.QTY_STRING_REGEX.exec(val);

		if (!result)
		{
			throw new Error('Quantity not recognized');
		}

		const scalarText = result[1] === '-' ? '-' + result[2] : result[2] ?? '1';
		const scalar = new Numeric(scalarText);
		const units = this.parseUnits(result[3].trim());

		return {
			scalar,
			numerator: units.numerator,
			denominator: units.denominator
		};
	}

	private parseUnits(units: string): UnitStructure
	{
		const cached = this.cache.get(units);

		if (cached)
		{
			return cached;
		}

		const num: UnitPower[] = [], den: UnitPower[] = [];
		let cursor = 0;
		let divide = false;

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
			RegexQtyParser.UNIT_MATCH_REGEX.lastIndex = cursor;
			const match = RegexQtyParser.UNIT_MATCH_REGEX.exec(units);

			if (!match)
			{
				throw new Error('Unit not recognized');
			}

			cursor += match[0].length;
			// A dot immediately followed by a digit is decimal syntax, not unit
			// multiplication. In particular m^2.1 must not become m^2 * unity.
			if (units[cursor] === '.' && /[0-9]/.test(units[cursor + 1] ?? ''))
			{
				throw new Error('Unit exponent must use safe integer syntax');
			}

			const unit = this.tokenMapper.getUnitToken(match[2]);
			const prefix = match[1] ? this.tokenMapper.getPrefixToken(match[1]) : undefined;

			if (!unit || prefix === null)
			{
				throw new Error('Unit not recognized');
			}

			const power = checkedExponent(Number(match[3] ?? match[4] ?? 1));
			const exponent = divide ? -power : power;

			if (exponent)
			{
				(exponent > 0 ? num : den).push({
					unit,
					...(prefix ? { prefix } : {}),
					exponent: Math.abs(exponent)
				});
			}

			if (cursor < units.length)
			{
				RegexQtyParser.UNIT_SEPARATOR_REGEX.lastIndex = cursor;
				const separator = RegexQtyParser.UNIT_SEPARATOR_REGEX.exec(units);

				if (!separator)
				{
					throw new Error('Unit not recognized');
				}

				cursor += separator[0].length;
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

		const result = { numerator: normalizePowers(num), denominator: normalizePowers(den) };
		// Bound retention when applications parse many distinct large powers.
		this.cache.set(units, result);

		return result;
	}
}

export type { ParserConfigInput, ParserConfig, ParserCacheStats, ParserCacheConfigInput } from './ParserConfig.js';
