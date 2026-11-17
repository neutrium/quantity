import { overrideAdapter } from './helpers/numeric.js';
import { describe, expect, it, vi } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { NumberAdapter } from '@neutrium/math/adapters/number';
const decimalAdapter = new DecimalScientificAdapter();
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';
import { scale } from '../dist/operations/unit-scale.js';
import { UnitTokenManager } from '../dist/UnitTokenManager.js';

it.each([true, false])('reuses the resolved signature when constructing base units, cache=%s', cache => {
	const Q = createQuantityClass({ numeric: new NumberAdapter(), parser: c => new RegexParser(c), config: { cache } });
	class Force extends Q {
		constructQuantity(...args) {
			const lookup = vi.spyOn(UnitTokenManager.instance, 'getUnit');
			try {
				const result = super.constructQuantity(...args);
				expect(lookup).not.toHaveBeenCalled();
				return result;
			} finally { lookup.mockRestore(); }
		}
	}
	const force = new Force('2 N');
	for (let i = 0; i < 2; i++) {
		const base = force.toBase();
		expect(base.scalar).toBe(2);
		expect(base.units()).toBe('kg*m/s2');
		expect(base.signature).toBe(force.signature);
	}
});

it.each([true, false])('expands large derived dimensions once per new structure, cache=%s', cache => {
	const Q = createQuantityClass({ numeric: new NumberAdapter(), parser: c => new RegexParser(c), config: { cache } });
	const force = new Q(1, 'N3000000000000000'), time = new Q(1, 's2'), unit = new Q('1 N');
	const lookup = vi.spyOn(UnitTokenManager.instance, 'getUnit');
	try {
		for (const [calculate, expansions] of [
			[() => force.div(time), 1], [() => force.mul(time), 1],
			// The power has the same units as the previously constructed force.
			[() => unit.pow(3000000000000000), cache ? 0 : 1],
		]) {
			lookup.mockClear();
			const result = calculate();
			expect(result.scalar).toBe(1);
			expect(lookup.mock.calls.filter(([token]) => token === '<newton>')).toHaveLength(expansions);
		}
	} finally { lookup.mockRestore(); }
});

it('revalidates large result dimensions if a construction hook changes a side', () => {
	const Q = createQuantityClass({ numeric: new NumberAdapter(), parser: c => new RegexParser(c) });
	class Rewritten extends Q {
		constructQuantity(input, units, parser) {
			input.numerator = [{ unit: '<newton>', exponent: Number.MAX_SAFE_INTEGER }];
			return new Q(input, units, parser);
		}
	}
	expect(() => new Rewritten(1, 'N3000000000000000').div(new Q('1 s2'))).toThrow(RangeError);
});

it('skips expanded-dimension checks for small fractional powers with large numerators', () => {
	const Q = createQuantityClass({ numeric: new NumberAdapter(), parser: c => new NearleyParser(c) });
	const input = '2 N^0.3333333333333333', signature = new Q(input).signature;
	const lookup = vi.spyOn(UnitTokenManager.instance, 'getUnit');
	try
	{
		expect(new Q(input).signature).toBe(signature);
		expect(lookup).not.toHaveBeenCalledWith('<newton>');
	}
	finally { lookup.mockRestore(); }
});

for (const Adapter of [DecimalArithmeticAdapter, DecimalScientificAdapter])
{
	it(`retains ${Adapter.name} results without adopting their scalars again`, () => {
		const base = new Adapter();
		const from = vi.fn(value => base.from(value));
		const numeric = overrideAdapter(base, { from });
		const Q = createQuantityClass({ numeric, parser: config => new RegexParser(config), config: { cache: false } });
		const a = new Q('2 m'), b = new Q('3 m'), cm = new Q('200 cm');
		const temp = new Q('20 tempC'), otherTemp = new Q('10 tempC'), delta = new Q('2 degC');
		const cases = [
			[() => a.add(b), '5'], [() => a.sub(b), '-1'],
			[() => a.mul(b), '6'], [() => a.div(b), '0.66666666666666666667'],
			[() => a.mul(2), '4'], [() => a.div(2), '1'],
			[() => a.add(cm), '4'], [() => a.mul(cm), '4'], [() => a.div(cm), '1'],
			[() => a.pow(2), '4'], [() => a.inverse(), '0.5'],
			[() => a.to('cm'), '200'], [() => cm.toBase(), '2'], [() => a.clone(), '2'],
			[() => temp.add(delta), '22'], [() => temp.sub(otherTemp), '10'],
			[() => temp.mul(2), '40'], [() => temp.div(2), '10'],
			[() => temp.to('tempF'), '68'], [() => temp.toBase(), '293.15'],
			[() => temp.pow(1), '20'],
		];
		for (const [operation, expected] of cases)
		{
			from.mockClear();
			expect(operation().scalar.toString()).toBe(expected);
			// Constants and external numeric operands still use from; completed
			// Decimal results must never pass through that conversion again.
			expect(from.mock.calls.filter(([value]) => numeric.isValue(value))).toEqual([]);
		}
		const add = vi.spyOn(numeric, 'add');
		const sum = a.add(b);
		expect(sum.scalar).toBe(add.mock.results[0].value);
		expect(a.clone().scalar).toBe(a.scalar);
	});
}

it('avoids native result conversion while still adopting external definitions and copies', () => {
	const numeric = new NumberAdapter();
	const Q = createQuantityClass({ numeric, parser: config => new RegexParser(config) });
	const a = new Q('2 m'), b = new Q('3 m');
	const from = vi.spyOn(numeric, 'from');
	expect(a.add(b).scalar).toBe(5);
	expect(a.sub(b).scalar).toBe(-1);
	expect(a.mul(b).scalar).toBe(6);
	expect(a.div(b).scalar).toBe(2 / 3);
	expect(a.clone().scalar).toBe(2);
	expect(from).not.toHaveBeenCalled();
	new Q(a);
	expect(from).toHaveBeenCalledExactlyOnceWith(2);
	from.mockClear();
	new Q({ scalar: a.scalar, numerator: a.numerator, denominator: a.denominator });
	expect(from).toHaveBeenCalledExactlyOnceWith(2);
});

it('retains scalar, unit and temperature validation for internal results', () => {
	const Q = createQuantityClass({ numeric: decimalAdapter, parser: config => new RegexParser(config) });
	const q = new Q('1 m');
	expect(() => q.createResult(1, q)).toThrow('Quantity scalar must be');
	expect(() => q.createResult(q.scalar, { numerator: [{ unit: '<unknown>', exponent: 1 }], denominator: [] })).toThrow();
	const cold = decimalAdapter.from(-274);
	expect(() => q.createResult(cold, { numerator: [{ unit: '<temp-C>', exponent: 1 }], denominator: [] })).toThrow('absolute zero');
	expect(() => q.createResult(q.scalar, { numerator: [{ unit: '<temp-C>', exponent: 2 }], denominator: [] })).toThrow('Cannot multiply by temperatures');
});

it('adopts a result if a subclass routes construction to another adapter context', () => {
	const Q = createQuantityClass({ numeric: decimalAdapter, parser: config => new RegexParser(config) });
	const Narrow = Q.withConfig({ numeric: { maxE: 2 } });
	class Routed extends Q {
		constructQuantity(input, units, parser) { return new Narrow(input, units, parser); }
	}
	const source = new Routed('100 m');
	expect(source.mul(10).scalar.isFinite()).toBe(false);
	expect(source.scalar.toString()).toBe('100');
});

for (const Parser of [NearleyParser, RegexParser])
{
	describe(`construction normalization (${Parser.name})`, () => {
		it('does not reconstruct scalars already created by the receiving adapter', () => {
			const from = vi.fn(value => decimalAdapter.from(value));
			const numeric = overrideAdapter(decimalAdapter, { from });
			const Q = createQuantityClass({ numeric, parser: config => new Parser(config) });
			for (const make of [() => new Q(36), () => new Q('36 km/h')]) {
				from.mockClear();
				expect(make().scalar.toString()).toBe('36');
				expect(from).toHaveBeenCalledTimes(1);
			}
			from.mockClear();
			expect(new Q(36, 'km/h').scalar.toString()).toBe('36');
			expect(from).toHaveBeenCalledExactlyOnceWith(36);
		});
		it('still adopts external scalars, definitions and quantity copies into the receiver context', () => {
			const Wide = createQuantityClass({ numeric: decimalAdapter, parser: config => new Parser(config) });
			const Narrow = Wide.withConfig({ numeric: { maxE: 2 } });
			const source = new Wide('1000 m');
			for (const result of [new Narrow(source), new Narrow(source.scalar, 'm'), new Narrow({
				scalar: source.scalar, numerator: source.numerator, denominator: source.denominator,
			})]) expect(result.scalar.isFinite()).toBe(false);
			expect(source.scalar.toString()).toBe('1000');
		});
	});
}

it('reads the source scale once when converting an absolute reading to an interval without caches', () => {
	const Q = createQuantityClass({ numeric: new NumberAdapter(), parser: c => new RegexParser(c), config: { cache: false } });
	const source = new Q('20 tempR'), target = new Q('degK');
	const lookup = vi.spyOn(UnitTokenManager.instance, 'getUnit');
	try {
		expect(source.to(target).scalar).toBeCloseTo(100 / 9, 14);
		expect(lookup.mock.calls.filter(([unit]) => unit === '<temp-R>')).toHaveLength(1);
	} finally {
		lookup.mockRestore();
	}
});

it('reuses catalog plans without retaining a scalar or another numeric context', () => {
	const Q = createQuantityClass({ numeric: decimalAdapter, parser: config => new RegexParser(config) });
	const source = new Q('1 m/h'), target = new Q('1 m/s');

	for (let repeat = 0; repeat < 3; repeat++)
	{
		for (const precision of [6, 30])
		{
			const n = decimalAdapter.withConfig({ precision });

			for (const value of ['1', '2', '-3'])
			{
				const scalar = n.from(value);
				expect(scale(scalar, source, target, n).eq(n.div(scalar, n.from(3600)))).toBe(true);
			}
		}
	}
});

it('keeps reciprocal plans separate and never mutates cached factors with scalar cancellation', () => {
	const Q = createQuantityClass({ numeric: decimalAdapter, parser: config => new RegexParser(config) });
	const source = new Q('2 cm'), inverse = new Q('1/m'), target = new Q('1 m');

	for (const value of [2, 4, 2])
	{
		const scalar = decimalAdapter.from(value);
		expect(scale(scalar, source, inverse, decimalAdapter, true).eq(100 / value)).toBe(true);
		expect(scale(scalar, source, target, decimalAdapter).eq(value / 100)).toBe(true);
	}

	const huge = new Q('1 ft10000'), metres = new Q('1 m10000');
	const first = scale(huge.scalar, huge, metres, decimalAdapter);
	scale(decimalAdapter.from(3), huge, metres, decimalAdapter);
	expect(scale(huge.scalar, huge, metres, decimalAdapter).eq(first)).toBe(true);
});

it('expands large derived dimensions once when copying or constructing from normalized records without caching', () => {
	const Q = createQuantityClass({ numeric: new NumberAdapter(), parser: c => new RegexParser(c), config: { cache: false } });
	const source = new Q(1, 'N3000000000000000');
	const lookup = vi.spyOn(UnitTokenManager.instance, 'getUnit');
	try {
		for (const input of [source, { scalar: 1, numerator: source.numerator, denominator: source.denominator }]) {
			lookup.mockClear();
			expect(new Q(input).signature).toBe(source.signature);
			expect(lookup.mock.calls.filter(([unit]) => unit === '<newton>')).toHaveLength(1);
		}
		const overflow = [{ unit: '<newton>', exponent: Number.MAX_SAFE_INTEGER }];
		expect(() => new Q({ scalar: 1, numerator: overflow, denominator: overflow })).toThrow(RangeError);
	} finally { lookup.mockRestore(); }
});
