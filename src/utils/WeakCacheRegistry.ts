/** Lazily share caches by configuration identity without retaining unused scopes. */
export class WeakCacheRegistry<K extends object, V extends object>
{
	private entries = new WeakMap<K, V>();

	constructor(private readonly create: (key: K) => V) {}

	get(key: K): V
	{
		const cached = this.entries.get(key);

		if (cached !== undefined)
		{
			return cached;
		}

		const value = this.create(key);
		this.entries.set(key, value);

		return value;
	}

	/** Existing parser instances resolve their scope again after invalidation. */
	clear(): void
	{
		this.entries = new WeakMap();
	}
}
