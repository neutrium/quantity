import type { CacheConfig, CacheStats } from './CacheConfig.js';
import { copyCacheText } from './cache-memory.js';
import { LruCache } from './LruCache.js';

/** Payload-specific rules; shared entry and UTF-16 key costs are added by the cache. */
export interface CachePolicy<T>
{
	measure(value: T): number;
	/** Optional semantic admission rule, evaluated before measurement or copying. */
	accept?(key: string, value: T): boolean;
	/** Take ownership of payload text only after the entry fits the budget. */
	detach?(value: T): T;
}

function enabled(config: CacheConfig): boolean { return config.maxEntries > 0 && config.maxBytes > 0; }

/** String-keyed retention policy over the weighted LRU, shared by parsers and conversions. */
export class BudgetCache<T>
{
	private entries?: LruCache<string, { value: T; bytes: number }>;

	constructor(private readonly config: CacheConfig, private readonly policy: CachePolicy<T>) {}

	/** Leave optional owner caches unallocated when caching is disabled. */
	static create<T>(config: CacheConfig, policy: CachePolicy<T>): BudgetCache<T> | undefined
	{
		return enabled(config) ? new BudgetCache(config, policy) : undefined;
	}

	get size(): number
	{
		return this.entries?.size ?? 0;
	}

	get weight(): number
	{
		return this.entries?.weight ?? 0;
	}

	get stats(): CacheStats
	{
		return Object.freeze({ entries: this.size, estimatedBytes: this.weight, ...this.config });
	}

	get(key: string): T | undefined
	{
		return this.entries?.get(key)?.value;
	}

	has(key: string): boolean
	{
		return this.entries?.has(key) ?? false;
	}

	*keys(): IterableIterator<string>
	{
		if (this.entries) yield* this.entries.keys();
	}

	delete(key: string): boolean
	{
		return this.entries?.delete(key) ?? false;
	}

	clear(): void
	{
		this.entries = undefined;
	}

	/** Rejected entries never copy text, allocate storage, evict, or change recency. */
	set(key: string, value: T): boolean
	{
		if (!enabled(this.config) || this.policy.accept?.(key, value) === false)
		{
			return false;
		}
		const keyBytes = 256 + 2 * key.length;

		if (keyBytes > this.config.maxBytes)
		{
			return false;
		}

		const payloadBytes = this.policy.measure(value);

		if (!Number.isSafeInteger(payloadBytes) || payloadBytes < 0)
		{
			throw new RangeError('Cache payload size must be a nonnegative safe integer');
		}

		// Maps, wrapper, entry bookkeeping and UTF-16 key contents. Check by
		// subtraction so individually safe estimates cannot overflow on addition.
		if (payloadBytes > this.config.maxBytes - keyBytes)
		{
			return false;
		}

		const ownedKey = copyCacheText(key);
		const ownedValue = this.policy.detach ? this.policy.detach(value) : value;
		(this.entries ??= new LruCache(this.config.maxEntries, {
			maxWeight: this.config.maxBytes, weigh: (_key, entry) => entry.bytes,
		})).set(ownedKey, { value: ownedValue, bytes: keyBytes + payloadBytes });

		return true;
	}
}
