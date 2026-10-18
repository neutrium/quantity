import { assertKnownKeys } from '@neutrium/utilities/validation';
import { cacheConfig, DEFAULT_CACHE_CONFIG, type CacheConfig, type CacheConfigInput } from '@neutrium/utilities/cache';

/** Quantity cache limits: false disables, true restores defaults, and an object overrides inherited limits. */
export type CacheSetting = boolean | CacheConfigInput;

/** Optional retention controls. Weak caches support on/off rather than byte estimates. */
export interface QuantityCacheInput
{
	/** Retained parser expression plans and token definitions. */
	parser?: CacheSetting;
	/** Per-quantity converted results and expression aliases. */
	conversionResults?: CacheSetting;
	/** Catalog factor plans for individual unit structures. */
	unitFactors?: CacheSetting;
	/** Reduced factor plans for source/target pairs. */
	conversionPlans?: CacheSetting;
	/** Extracted rational representations of immutable scalars. */
	scalarTerms?: boolean;
	/** Adapter-specific absolute-zero boundaries and offsets. */
	temperatureConstants?: boolean;
	/** Unit identities, base metadata, formatting and lazy instance values. */
	metadata?: boolean;
}

/**
 * Settings accepted by the factory and `Quantity.withConfig()`.
 * Numeric options belong to the selected adapter. All properties are optional;
 * omitted settings inherit from the parent class, without mutating that class.
 * @example
 * ```ts
 * import { Quantity } from '@neutrium/quantity';
 * const Q = Quantity.withConfig({ cache: { conversionResults: false } });
 * const q = new Q('1 m');
 * q.to('cm') === q.to('cm'); // false: converted results are not retained
 * ```
 */
export interface QuantityConfigInput<Numeric = never>
{
	/** Numeric settings interpreted by the selected adapter. */
	numeric?: Numeric;
	/** Quantity cache policy; false disables all optional caches, true restores their defaults. */
	cache?: boolean | QuantityCacheInput;
}

/** Fully resolved, immutable retention settings. */
export interface QuantityCacheConfig
{
	/** Retained parser expression plans and token definitions. */
	readonly parser: Readonly<CacheConfig>;
	/** Per-quantity converted results and expression aliases. */
	readonly conversionResults: Readonly<CacheConfig>;
	/** Catalog factor plans for individual unit structures. */
	readonly unitFactors: Readonly<CacheConfig>;
	/** Reduced factor plans for source/target pairs. */
	readonly conversionPlans: Readonly<CacheConfig>;
	/** Extracted rational representations of immutable scalars. */
	readonly scalarTerms: boolean;
	/** Adapter-specific absolute-zero boundaries and offsets. */
	readonly temperatureConstants: boolean;
	/** Unit identities, base metadata, formatting and lazy instance values. */
	readonly metadata: boolean;
}

/** Complete configuration snapshot. */
export interface QuantityConfig<Numeric extends object = object>
{
	/** Numeric settings interpreted by the selected adapter. */
	readonly numeric: Readonly<Numeric>;
	/** Resolved Quantity cache policy; disabled bounded caches have zero limits. */
	readonly cache: QuantityCacheConfig;
}
const planLimits = cacheConfig({ maxEntries: 1024, maxBytes: 1024 * 1024 });
const disabled = cacheConfig({ maxEntries: 0, maxBytes: 0 });
export const DEFAULT_QUANTITY_CACHE: QuantityCacheConfig = Object.freeze({
	/** Retained parser expression plans and token definitions. */
	parser: DEFAULT_CACHE_CONFIG, conversionResults: DEFAULT_CACHE_CONFIG,
	/** Catalog factor plans for individual unit structures. */
	unitFactors: planLimits, conversionPlans: planLimits,
	/** Extracted rational representations of immutable scalars. */
	scalarTerms: true, temperatureConstants: true, metadata: true,
});
const bounded = ['parser', 'conversionResults', 'unitFactors', 'conversionPlans'] as const;
const weak = ['scalarTerms', 'temperatureConstants', 'metadata'] as const;

/** Resolve partial overrides without changing parent policy or caller-owned objects. */
export function resolveQuantityCache(input: QuantityConfigInput['cache'], parent = DEFAULT_QUANTITY_CACHE): QuantityCacheConfig
{
	if (input === undefined)
	{
		return parent;
	}

	if (input === true)
	{
		return DEFAULT_QUANTITY_CACHE;
	}

	const options: QuantityCacheInput = input === false
		? { parser: false, conversionResults: false, unitFactors: false, conversionPlans: false,
			scalarTerms: false, temperatureConstants: false, metadata: false } : input;
	assertKnownKeys(options as unknown, [...bounded, ...weak], 'cache');
	const result = { ...parent };

	for (const name of bounded)
	{
		const value = options[name];
		result[name] = value === false ? disabled : value === true ? DEFAULT_QUANTITY_CACHE[name]
			: cacheConfig(value, parent[name], { name: 'cache.' + name, reuse: true });
	}

	for (const name of weak)
	{
		const value = options[name];

		if (value !== undefined && typeof value !== 'boolean')
		{
			throw new TypeError('cache.' + name + ' must be a boolean');
		}

		result[name] = value ?? parent[name];
	}
	return Object.freeze(result);
}
