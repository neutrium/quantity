import { overrideAdapter } from './helpers/numeric.js';
import { describe, expect, it, vi } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const decimalAdapter = new DecimalScientificAdapter();
import { NumberAdapter } from '@neutrium/utilities/number';
const numberAdapter = new NumberAdapter();
import { scalarTerm } from '../dist/operations/exact-sum.js';
import { conversionKey } from '../dist/operations/unit-identity.js';
import { scale } from '../dist/operations/unit-scale.js';
import { BudgetCache } from '@neutrium/utilities/cache';
import { CacheScope } from '../dist/utils/CacheScope.js';
import { resolveQuantityCache } from '../dist/QuantityConfig.js';

describe('rational scalar caching', () => {
	function adapter()
	{
		return overrideAdapter(decimalAdapter, {
			toRationalTerm: vi.fn(decimalAdapter.toRationalTerm.bind(decimalAdapter)),
			toString: () => { throw Error('Unexpected formatting'); },
		});
	}

	it('caches immutable values independently for each adapter', () => {
		const value = decimalAdapter.from('1.25'), a = adapter(), b = adapter();
		const first = scalarTerm(value, a);
		expect(first).toEqual({ numerator: 125n, denominator: 1n, exponent: -2n });
		expect(scalarTerm(value, a)).toBe(first);
		expect(scalarTerm(value, b)).toEqual(first);
		expect(a.toRationalTerm).toHaveBeenCalledTimes(1);
		expect(b.toRationalTerm).toHaveBeenCalledTimes(1);
	});
	it('does not retain large scalars or failed extractions', () => {
		const numeric = adapter(), large = decimalAdapter.from('1'.repeat(4097));
		const first = scalarTerm(large, numeric), second = scalarTerm(large, numeric);
		expect(second).toEqual(first);
		expect(second).not.toBe(first);
		expect(numeric.toRationalTerm).toHaveBeenCalledTimes(2);
		for (let i = 0; i < 2; i++) expect(() => scalarTerm(decimalAdapter.from(NaN), numeric)).toThrow();
		expect(numeric.toRationalTerm).toHaveBeenCalledTimes(4);
	});
	it('bypasses disabled retention without disturbing a warm scope', () => {
		const numeric = adapter(), value = decimalAdapter.from('1.25');
		const warm = scalarTerm(value, numeric);
		const disabled = new CacheScope(resolveQuantityCache({ scalarTerms: false }));
		const first = scalarTerm(value, numeric, disabled), second = scalarTerm(value, numeric, disabled);
		expect(first).toEqual(warm);
		expect(second).toEqual(warm);
		expect(first).not.toBe(second);
		expect(scalarTerm(value, numeric)).toBe(warm);
		expect(numeric.toRationalTerm).toHaveBeenCalledTimes(3);
	});
});

describe('conversion key reuse', () => {
	it('reuses shared arrays and keeps target and reciprocal modes distinct', () => {
		const source = new Quantity('km/h'), target = new Quantity('m/s'), other = new Quantity('ft/s');
		const first = conversionKey(source, target, false);
		const stringify = vi.spyOn(JSON, 'stringify');
		try {
			expect(conversionKey({ numerator: source.numerator, denominator: source.denominator }, target, false)).toBe(first);
			expect(stringify).not.toHaveBeenCalled();
			expect(conversionKey(source, other, false)).not.toBe(first);
			expect(conversionKey(source, target, true)).not.toBe(first);
			expect(conversionKey(source, undefined, false)).not.toBe(first);
			expect(conversionKey(source, target, false)).toBe(first);
		} finally { stringify.mockRestore(); }
	});

	it('continues consulting the budgeted plan cache after a key has been reused', () => {
		const source = new Quantity('km/h'), target = new Quantity('m/s');
		const get = vi.spyOn(BudgetCache.prototype, 'get');
		try {
			expect(scale(36, source, target, numberAdapter)).toBe(10);
			get.mockClear();
			expect(scale(72, source, target, numberAdapter)).toBe(20);
			const index = get.mock.results.findIndex(result => result.value?.factors instanceof Map);
			expect(index).toBeGreaterThanOrEqual(0);
			const plan = get.mock.results[index].value, cache = get.mock.contexts[index];
			cache.clear();
			get.mockClear();
			expect(scale(108, source, target, numberAdapter)).toBe(30);
			expect(get.mock.results.some(result => result.value === plan)).toBe(false);
		} finally { get.mockRestore(); }
	});
});

it('declines oversized unit-factor keys without preventing conversion', () => {
	const meter = new Quantity('m');
	const source = { numerator: Object.freeze(Array(40000).fill(meter.numerator[0])), denominator: meter.denominator };
	const set = vi.spyOn(BudgetCache.prototype, 'trySet');

	try
	{
		expect(scale(2, source, undefined, numberAdapter)).toBe(2);
		const index = set.mock.calls.findIndex(([, value]) => value instanceof Map);
		expect(index).toBeGreaterThanOrEqual(0);
		const [key] = set.mock.calls[index], cache = set.mock.contexts[index];
		expect(cache.stats.maxBytes).toBe(1024 * 1024);
		expect(set.mock.results[index].value).toBe(false);
		expect(cache.has(key)).toBe(false);
		expect(cache.weight).toBeLessThanOrEqual(cache.stats.maxBytes);
	}
	finally
	{
		set.mockRestore();
	}
});
