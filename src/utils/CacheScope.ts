import { DEFAULT_QUANTITY_CACHE, type QuantityCacheConfig } from '../QuantityConfig.js';

/** @internal Ownership for optional caches; disabled scopes allocate no storage. */
export class CacheScope
{
	private stores?: Map<symbol, unknown>;

	constructor(readonly config: QuantityCacheConfig = DEFAULT_QUANTITY_CACHE) {}

	enabled(family: keyof QuantityCacheConfig): boolean
	{
		const setting = this.config[family];
		return typeof setting === 'boolean' ? setting : setting.maxEntries > 0 && setting.maxBytes > 0;
	}

	/** Read existing storage without allocating it on a miss. */
	peek<T>(family: keyof QuantityCacheConfig, key: symbol): T | undefined
	{
		return this.enabled(family) ? this.stores?.get(key) as T | undefined : undefined;
	}

	get<T>(family: keyof QuantityCacheConfig, key: symbol, create: () => T): T | undefined
	{
		if (!this.enabled(family))
		{
			return undefined;
		}

		let cache = this.stores?.get(key) as T | undefined;

		if (cache === undefined)
		{
			cache = create();
			(this.stores ??= new Map()).set(key, cache);
		}
		return cache
		;
	}
}

/** Default scope for standalone internal helpers; configured classes own their scope. */
export const defaultCacheScope = new CacheScope();
