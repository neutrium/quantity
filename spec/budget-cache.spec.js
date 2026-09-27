import { describe, expect, it, vi } from 'vitest';
import { BudgetCache } from '../dist/utils/BudgetCache.js';
import { WeakCacheRegistry } from '../dist/utils/WeakCacheRegistry.js';

describe('shared cache admission and accounting', () => {
	const config = { maxEntries: 10, maxBytes: 600 };
	it('counts keys, shared overhead and payloads and evicts in access order', () => {
		const cache = new BudgetCache(config, { measure: value => value });
		expect(cache.set('a', 10)).toBe(true); // 256 + two key bytes + 10
		cache.set('b', 10);
		expect(cache.weight).toBe(536);
		expect(cache.get('a')).toBe(10);
		cache.set('c', 20);
		expect([...cache.keys()]).toEqual(['a', 'c']);
		expect(cache.stats).toEqual({ entries: 2, estimatedBytes: 546, ...config });
		cache.set('a', 0);
		expect(cache.weight).toBe(536);
		expect(cache.delete('c')).toBe(true);
		expect(cache.delete('missing')).toBe(false);
		expect(cache.weight).toBe(258);
		const snapshot = cache.stats;
		expect(Object.isFrozen(snapshot)).toBe(true);
		cache.clear();
		expect(cache.size).toBe(0);
		expect(cache.weight).toBe(0);
		expect(cache.get('a')).toBeUndefined();
		expect(snapshot.estimatedBytes).toBe(258);
		cache.set('x', 0);
		expect(cache.has('x')).toBe(true);
	});

	it('rejects oversized replacement without deleting, evicting, copying or refreshing', () => {
		const detach = vi.fn(value => value);
		const cache = new BudgetCache(config, { measure: value => value, detach });
		cache.set('a', 10); cache.set('b', 10);
		detach.mockClear();
		expect(cache.set('a', 1000)).toBe(false);
		expect(cache.set('x'.repeat(400), 0)).toBe(false);
		expect(cache.stats.estimatedBytes).toBe(536);
		expect(cache.has('a')).toBe(true);
		expect(detach).not.toHaveBeenCalled();
		cache.set('c', 10);
		expect([...cache.keys()]).toEqual(['b', 'c']); // rejected a did not become hot
	});

	it('skips policy work when disabled and detaches only admitted payloads', () => {
		const measure = vi.fn(() => 10), accept = vi.fn(() => true), detach = vi.fn(value => ({ ...value }));
		for (const limits of [{ maxEntries: 0, maxBytes: 600 }, { maxEntries: 10, maxBytes: 0 }]) {
			expect(BudgetCache.create(limits, { measure })).toBeUndefined();
			const cache = new BudgetCache(limits, { measure, accept, detach });
			expect(cache.set('a', {})).toBe(false);
			expect(cache.stats.entries).toBe(0);
		}
		expect(measure).not.toHaveBeenCalled();
		expect(accept).not.toHaveBeenCalled();
		expect(detach).not.toHaveBeenCalled();
		const cache = new BudgetCache(config, { measure, accept: key => key === key.trim(), detach });
		expect(cache.set(' a ', {})).toBe(false);
		expect(cache.set('x'.repeat(400), {})).toBe(false);
		expect(measure).not.toHaveBeenCalled();
		const input = { text: 'payload' };
		expect(cache.set('a', input)).toBe(true);
		expect(cache.get('a')).toEqual(input);
		expect(cache.get('a')).not.toBe(input);
		expect(measure).toHaveBeenCalledTimes(1);
		expect(detach).toHaveBeenCalledTimes(1);
	});

	it('does not allocate entry storage before admission, or mutate it after a failed copy', () => {
		const cache = new BudgetCache(config, { measure: value => value, detach: value => {
			if (value === 2) throw new Error('Failed ownership copy');
			return value;
		} });
		expect(cache.set('oversized', 1000)).toBe(false);
		// Storage inspection is confined to this allocation test: empty public
		// statistics cannot distinguish unallocated storage from an empty map.
		expect(cache.entries).toBeUndefined();
		cache.set('a', 1); cache.set('b', 1);
		const before = cache.stats;
		expect(() => cache.set('a', 2)).toThrow('Failed ownership copy');
		expect(cache.stats).toEqual(before);
		expect([...cache.keys()]).toEqual(['a', 'b']);
		cache.clear();
		expect(cache.entries).toBeUndefined();
	});

	it('rejects invalid estimates and avoids overflow near the safe-integer limit', () => {
		const cache = new BudgetCache({ maxEntries: 2, maxBytes: Number.MAX_SAFE_INTEGER }, { measure: value => value });
		for (const invalid of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])
			expect(() => cache.set('a', invalid)).toThrow(RangeError);
		expect(cache.set('a', Number.MAX_SAFE_INTEGER)).toBe(false);
		expect(cache.set('a', Number.MAX_SAFE_INTEGER - 258)).toBe(true);
		expect(cache.weight).toBe(Number.MAX_SAFE_INTEGER);
		cache.set('b', 0);
		expect([...cache.keys()]).toEqual(['b']);
		const countLimited = new BudgetCache({ maxEntries: 1, maxBytes: 10000 }, { measure: () => 0 });
		countLimited.set('a', 0); countLimited.set('b', 0);
		expect([...countLimited.keys()]).toEqual(['b']);
	});
});

it('shares registry values by scope identity and recreates all scopes after invalidation', () => {
	const create = vi.fn(() => ({}));
	const registry = new WeakCacheRegistry(create);
	const a = {}, b = {};
	expect(create).not.toHaveBeenCalled();
	const first = registry.get(a), second = registry.get(b);
	expect(registry.get(a)).toBe(first);
	expect(second).not.toBe(first);
	expect(create).toHaveBeenCalledTimes(2);
	registry.clear();
	expect(create).toHaveBeenCalledTimes(2);
	expect(registry.get(a)).not.toBe(first);
	expect(registry.get(b)).not.toBe(second);
	expect(create).toHaveBeenCalledTimes(4);
});
