/** Limits for one retained cache; zero for either limit disables retention. */
export interface CacheConfigInput
{
	/** Maximum entries. Default: 1024. */
	maxEntries?: number;
	/** Maximum estimated retained bytes. Default: 4 MiB, not a heap limit. */
	maxBytes?: number;
}

/** Fully resolved immutable cache limits. */
export type CacheConfig = Readonly<Required<CacheConfigInput>>;

/** An immutable snapshot of a cache's estimated retention and limits. */
export interface CacheStats
{
	/** Number of retained entries. */
	readonly entries: number;
	/** Estimated bytes retained by entries and their keys. */
	readonly estimatedBytes: number;
	/** Configured entry-count limit. */
	readonly maxEntries: number;
	/** Configured estimated-byte limit. */
	readonly maxBytes: number;
}

/** @internal */
export const DEFAULT_CACHE_CONFIG: CacheConfig = Object.freeze({ maxEntries: 1024, maxBytes: 4 * 1024 * 1024 });

/** @internal Reject invalid objects and misspelled options rather than silently ignoring them. */
export function validateKeys(value: unknown, keys: readonly string[], name: string): asserts value is Record<string, unknown>
{
	if (!value || typeof value !== 'object' || Array.isArray(value))
	{
		throw new TypeError(`Expected ${name} configuration object`);
	}

	for (const key of Reflect.ownKeys(value))
	{
		if (typeof key !== 'string' || !keys.includes(key))
		{
			throw new TypeError(`Unknown ${name} option: ${String(key)}`);
		}
	}
}

/** @internal Merge partial limits and detach them from caller-owned settings. */
export function cacheConfig(input?: unknown, parent = DEFAULT_CACHE_CONFIG, name = 'cache'): CacheConfig
{
	if (input === undefined)
	{
		return parent;
	}

	validateKeys(input, ['maxEntries', 'maxBytes'], name);

	const result = { ...parent };

	for (const key of ['maxEntries', 'maxBytes'] as const)
	{
		const value = input[key];

		if (value === undefined)
		{
			continue;
		}

		if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
		{
			throw new RangeError(`${name} ${key} must be a nonnegative safe integer`);
		}

		result[key] = value;
	}

	return Object.freeze(result);
}
