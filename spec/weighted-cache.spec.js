import { it, expect } from 'vitest';
import { LruCache } from '../dist/utils/LruCache.js';

it('accounts for replacement, recency, eviction, deletion and clearing in weighted caches', () => {
    const cache = new LruCache(10, { maxWeight: 10, weigh: (_key, value) => value });
    cache.set('a', 4).set('b', 4);
    cache.get('a');
    cache.set('c', 5);
    expect([...cache.keys()]).toEqual(['a', 'c']);
    expect(cache.weight).toBe(9);
    cache.set('a', 2);
    expect(cache.weight).toBe(7);
    cache.delete('c');
    expect(cache.weight).toBe(2);
    cache.delete('missing');
    expect(cache.weight).toBe(2);
    cache.set('a', 11);
    expect(cache.weight).toBe(0);
    expect(cache.size).toBe(0);
    cache.set('d', 10);
    cache.clear();
    expect(cache.weight).toBe(0);
    expect(cache.size).toBe(0);
});

it('enforces entry limits independently of byte weights, including safe-integer budgets', () => {
    const cache = new LruCache(2, { maxWeight: Number.MAX_SAFE_INTEGER, weigh: (_key, value) => value });
    cache.set('a', Number.MAX_SAFE_INTEGER).set('b', Number.MAX_SAFE_INTEGER);
    expect(cache.size).toBe(1);
    expect(cache.weight).toBe(Number.MAX_SAFE_INTEGER);
    cache.set('c', 0).set('d', 0);
    expect([...cache.keys()]).toEqual(['c', 'd']);
    expect(cache.weight).toBe(0);
});
