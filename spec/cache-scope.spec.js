import { describe, expect, it, vi } from 'vitest';
import { CacheScope } from '../dist/utils/CacheScope.js';
import { resolveQuantityCache } from '../dist/QuantityConfig.js';

describe('cache scope lookup', () => {
	it('does not allocate on misses and returns storage created by get', () => {
		const scope = new CacheScope(), key = Symbol();
		expect(scope.peek('metadata', key)).toBeUndefined();
		expect(scope.stores).toBeUndefined();
		const create = vi.fn(() => new WeakMap());
		const cache = scope.get('metadata', key, create);
		expect(scope.peek('metadata', key)).toBe(cache);
		expect(scope.peek('metadata', Symbol())).toBeUndefined();
		expect(scope.stores.size).toBe(1);
		expect(scope.get('metadata', key, create)).toBe(cache);
		expect(create).toHaveBeenCalledTimes(1);
	});

	it.each(['metadata', 'unitFactors'])('does not allocate for disabled %s caches', family => {
		const scope = new CacheScope(resolveQuantityCache(false)), key = Symbol();
		const create = vi.fn(() => new WeakMap());
		expect(scope.get(family, key, create)).toBeUndefined();
		expect(scope.peek(family, key)).toBeUndefined();
		expect(create).not.toHaveBeenCalled();
		expect(scope.stores).toBeUndefined();
	});
});
