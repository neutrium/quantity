import { numericSettings, type NumericSettings } from './numeric/backend.js';
import { Quantity, type QuantityInput } from './QuantityCore.js';
import type { QuantityConfigInput } from './QuantityConfig.js';
import type { ArithmeticAdapter } from '@neutrium/utilities/numeric/arithmetic';
import type { Parser } from './parsers/Parser.js';
import type { ParserConfig } from './parsers/ParserConfig.js';
import type { CacheConfig } from '@neutrium/utilities/cache';
import { resolveQuantityCache, type QuantityConfig } from './QuantityConfig.js';
import { CacheScope } from './utils/CacheScope.js';
import { parserConfig } from './parsers/ParserConfig.js';
import { assertKnownKeys } from '@neutrium/utilities/validation';
import type { NumericOptions } from '@neutrium/utilities/numeric/helpers';
export type { NumericOptions } from '@neutrium/utilities/numeric/helpers';
export type { NumericSettings } from './numeric/backend.js';

/**
 * A constructible Quantity class bound to one numeric backend and parser factory.
 * Returned by {@link createQuantityClass} and used by the package presets.
 * The scalar type and available numeric configuration are inferred from the adapter.
 */
export interface NumericQuantityConstructor<T, Options = never, Resolved extends object = object>
{
	/**
	 * Construct from an expression, scalar with optional units, definition, or Quantity.
	 * An existing Quantity preserves its units and converts to this class's backend;
	 * a plain definition must already contain a destination-native scalar.
	 * @param input - Value or expression to construct.
	 * @param units - Units for a separate scalar; ignored for quantities and definitions.
	 * @param parser - Optional override retained by derived operations and clones.
	 * @throws For invalid syntax, units, scalar representations or absolute temperatures.
	 * @example
	 * ```ts
	 * import { Quantity } from '@neutrium/quantity';
	 * import { Quantity as NumberQuantity } from '@neutrium/quantity/number';
	 * const native = new NumberQuantity('1.25 m');
	 * const decimal = new Quantity(native);
	 * decimal.to('cm').scalar.toString(); // "125"
	 * ```
	 */
	new(input: QuantityInput<T>, units?: string, parser?: Parser<T>): Quantity<T, Resolved>;
	/**
	 * Create a class with numeric overrides and Quantity cache policies.
	 * Omitted settings inherit; `cache: false` disables optional caching and `true`
	 * restores defaults. Numeric overrides require a configurable adapter.
	 * The original class is unchanged; results retain the newly configured class.
	 * @example
	 * ```ts
	 * import { Quantity } from '@neutrium/quantity';
	 * const Uncached = Quantity.withConfig({ cache: false });
	 * new Uncached('2 m').config === Uncached.config; // true
	 * ```
	 */
	withConfig<C extends new (...args: never[]) => Quantity<any>>(this: C, options: QuantityConfigInput<Options>): C;
	/** Complete effective numeric and cache configuration. */
	readonly config: QuantityConfig<Resolved>;
	/** Effective parser configuration. */
	readonly parserConfig: ParserConfig;
	/** Per-instance conversion cache limits. */
	readonly conversionCacheConfig: CacheConfig;
}

/**
 * Create a Quantity class with a chosen numeric backend and parser.
 * @param options - Adapter instance, parser factory, and optional Quantity configuration.
 * The parser factory receives resolved parser-cache settings. Its parser must evaluate
 * scalars with the adapter supplied to `parse`; wrappers should forward its cache scope.
 * @returns A class whose instances, clones and calculated results retain this configuration.
 * @throws TypeError for unknown options, an invalid parser factory, or an adapter
 * missing the arithmetic capabilities required by Quantity.
 * @example
 * ```ts
 * import { createQuantityClass } from '@neutrium/quantity/factory';
 * import { RegexParser } from '@neutrium/quantity/parsers/regex';
 * import { NumberAdapter } from '@neutrium/utilities/number';
 *
 * const NativeQuantity = createQuantityClass({
 *     numeric: new NumberAdapter(),
 *     parser: config => new RegexParser(config),
 *     config: { cache: false },
 * });
 * new NativeQuantity('2 km').to('m').scalar; // 2000
 * ```
 */
export function createQuantityClass<A extends ArithmeticAdapter<any>>(options: {
	/** Immutable backend instance used for this class's scalar representation and arithmetic. */
	numeric: A;
	/** Create a parser from the resolved Quantity parser-cache settings. */
	parser: (config: ParserConfig) => Parser<NoInfer<ReturnType<A['from']>>>;
	/** Optional numeric overrides and Quantity cache policies, using the withConfig shape. */
	config?: QuantityConfigInput<NoInfer<NumericOptions<A>>>;
}): NumericQuantityConstructor<ReturnType<A['from']>, NumericOptions<A>, NumericSettings<A>>
{
	if (!options?.numeric || typeof options.parser !== 'function')
	{
		throw new TypeError('A numeric adapter and parser factory are required');
	}

	assertKnownKeys(options, ['numeric', 'parser', 'config'], 'Quantity factory');
	type T = ReturnType<A['from']>;
	const numeric = options.numeric, createParser = options.parser;
	const policy = resolveQuantityCache(undefined);

	for (const method of ['from', 'isValue', 'add', 'sub', 'mul', 'div', 'neg', 'compare', 'isFinite', 'isInteger', 'toNumber', 'toString', 'powInteger', 'toBytes'] as const)
	{
		if (typeof numeric[method] !== 'function')
		{
			throw new TypeError('Quantity requires an arithmetic numeric adapter; missing ' + method);
		}
	}

	class ConfiguredQuantity extends Quantity<T, NumericSettings<A>>
	{
		protected static override numericAdapter = numeric;
		protected static override cacheContext = new CacheScope(policy);
		protected static override parserOptions = parserConfig({ cache: policy.parser });
		protected static override resolvedConfig = Object.freeze({ numeric: numericSettings(numeric), cache: policy });
		constructor(input: QuantityInput<T>, units?: string, parser?: Parser<T>)
		{
			super(input, units, parser === undefined ? createParser(new.target.parserConfig) : parser);
		}
	}

	return (options.config === undefined ? ConfiguredQuantity : ConfiguredQuantity.withConfig(options.config)) as
		NumericQuantityConstructor<T, NumericOptions<A>, NumericSettings<A>>;
}

export { Quantity };
export type { QuantityInput };
export type { QuantityConfigInput, QuantityConfig, QuantityCacheInput, QuantityCacheConfig, CacheSetting } from './QuantityConfig.js';
export type { Parser } from './parsers/Parser.js';
export type { QuantityDefinition, UnitStructure, UnitPower } from './QuantityDefinition.js';
/** Recognize quantities from any backend in this installed package. */
export { isQuantity } from './guards.js';

export type { ArithmeticAdapter } from '@neutrium/utilities/numeric/arithmetic';
export type { ScientificAdapter } from '@neutrium/utilities/numeric/scientific';

export type { ParserConfigInput, ParserConfig, ParserCacheConfigInput, ParserCacheStats } from './parsers/ParserConfig.js';
export type { CacheConfigInput, CacheConfig } from '@neutrium/utilities/cache';
