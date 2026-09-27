/** Bounded cache that evicts one least-recently-used entry at a time. */
export class LruCache<K, V> extends Map<K, V>
{
	private weights?: Map<K, number>;
	private retainedWeight = 0;

	constructor(private readonly capacity = 1024, private readonly budget?: { maxWeight: number; weigh: (key: K, value: V) => number })
	{
		super();

		if (budget)
		{
			this.weights = new Map();
		}
	}

	/** Weight retained by a cache with a weighted budget. */
	get weight(): number { return this.retainedWeight; }

	override delete(key: K): boolean
	{
		const deleted = super.delete(key);

		if (deleted && this.weights)
		{
			this.retainedWeight -= this.weights.get(key)!;
			this.weights.delete(key);
		}

		return deleted;
	}

	override clear(): void
	{
		super.clear();
		this.weights?.clear();
		this.retainedWeight = 0;
	}

	override get(key: K): V | undefined
	{
		const value = super.get(key);

		if (value !== undefined)
		{
			super.delete(key);
			super.set(key, value);
		}

		return value;
	}

	override set(key: K, value: V): this
	{
		const weight = this.budget?.weigh(key, value) ?? 0;

		if (!Number.isSafeInteger(weight) || weight < 0)
		{
			throw new RangeError('Cache weight must be a nonnegative safe integer');
		}

		this.delete(key);

		if (this.capacity === 0 || this.budget && weight > this.budget.maxWeight)
		{
			return this;
		}

		// Evict before insertion so adding two individually safe weights cannot overflow.
		while (this.size && (this.size >= this.capacity || this.budget && this.retainedWeight > this.budget.maxWeight - weight))
		{
			this.delete(this.keys().next().value!);
		}

		super.set(key, value);

		if (this.weights)
		{
			this.weights.set(key, weight);
			this.retainedWeight += weight;
		}

		return this;
	}
}
