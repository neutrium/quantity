import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const testNumeric = new DecimalScientificAdapter();
import { describe, expect, it, vi } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { Quantity as NumberQuantity } from '@neutrium/quantity/number';
import { createQuantityClass } from '@neutrium/quantity/factory';
import { isQuantityDefinition } from '@neutrium/quantity/guards.js';
import { NearleyParser } from '@neutrium/quantity/parsers/nearley';
import { floatAdapter } from './helpers/numeric.js';

describe('construction across numeric backends', () => {
	it('copies native quantities to Decimal with units and destination configuration', () => {
		const Target = Quantity.withConfig({ numeric: { precision: 3 }, cache: false });
		const source = new NumberQuantity('12.345 km/h');
		const stringify = vi.spyOn(source.numeric, 'toString');
		try {
			const copy = new Target(source);
			expect(copy).toBeInstanceOf(Target);
			expect(copy.scalar).toBeInstanceOf(Decimal);
			expect(copy.scalar.toString()).toBe('12.345');
			expect(copy.add('0 km/h').scalar.toString()).toBe('12.3');
			expect(copy.units()).toBe(source.units());
			expect(copy.config).toBe(Target.config);
			expect(copy.clone().same(copy)).toBe(true);
			expect(source.scalar).toBe(12.345);
			expect(stringify).not.toHaveBeenCalled();
		} finally { stringify.mockRestore(); }
	});

	it('converts Decimal scalars to native numbers without formatting the quantity or scalar', () => {
		const Source = createQuantityClass({ numeric: new DecimalScientificAdapter(), parser: c => new NearleyParser(c) });
		const source = new Source('1.234567890123456789 cm3/s2');
		vi.spyOn(source, 'toString').mockImplementation(() => { throw new Error('Display formatting called'); });
		const stringify = vi.spyOn(source.numeric, 'toString').mockImplementation(() => { throw new Error('Scalar formatting called'); });
		try {
			const copy = new NumberQuantity(source);
			expect(copy.scalar).toBe(Number('1.234567890123456789'));
			expect(copy.units()).toBe('cm3/s2');
			expect(copy.to('m3/s2').scalar).toBeCloseTo(copy.scalar * 1e-6, 15);
			expect(source.scalar.toString()).toBe('1.234567890123456789');
			expect(stringify).not.toHaveBeenCalled();
		} finally { stringify.mockRestore(); }
	});

	it('ignores Decimal output limits when constructing double and float quantities', () => {
		const Restricted = Quantity.withConfig({ numeric: { maxOutputDigits: 5, toExpPos: 2000, toExpNeg: -2000 } });
		const Float = createQuantityClass({ numeric: floatAdapter, parser: c => new NearleyParser(c) });
		for (const [input, expected] of [['123456', 123456], ['1.23456789', 1.23456789], ['1e400', Infinity], ['1e-400', 0]]) {
			const source = new Restricted(input, 'm');
			expect(() => source.numeric.toString(source.scalar)).toThrow('Output digit limit');
			expect(new NumberQuantity(source).scalar).toBe(expected);
			expect(new Float(source).scalar).toBe(Math.fround(expected));
		}
	});

	it('applies destination representation and range limits', () => {
		const FloatQuantity = createQuantityClass({ numeric: floatAdapter, parser: c => new NearleyParser(c) });
		expect(new FloatQuantity(new Quantity('1.23456789 m')).scalar).toBe(Math.fround(1.23456789));
		expect(new FloatQuantity(new NumberQuantity('1.23456789 m')).scalar).toBe(Math.fround(1.23456789));
		expect(new NumberQuantity(new Quantity('1e400 m')).scalar).toBe(Infinity);
		const Narrow = Quantity.withConfig({ numeric: { minE: -2, maxE: 2 } });
		expect(new Narrow(new NumberQuantity('1000 m')).scalar.toString()).toBe('Infinity');
		expect(new Narrow(new NumberQuantity('0.001 m')).scalar.isZero()).toBe(true);
	});

	it('preserves negative zero and special values in both directions', () => {
		for (const value of [-0, NaN, Infinity, -Infinity]) {
			const decimal = new Quantity(new NumberQuantity(value, 'm'));
			expect(Object.is(decimal.numeric.toNumber(decimal.scalar), value)).toBe(true);
			const native = new NumberQuantity(new Quantity(value, 'm'));
			expect(Object.is(native.scalar, value)).toBe(true);
			expect(decimal.units()).toBe('m');
			expect(native.units()).toBe('m');
		}
	});

	it('preserves absolute-temperature units and their arithmetic restrictions', () => {
		for (const [Source, Target] of [[NumberQuantity, Quantity], [Quantity, NumberQuantity]]) {
			const source = new Source('-273.15 tempC');
			const copy = new Target(source);
			expect(copy.units()).toBe('tempC');
			expect(copy.numeric.toNumber(copy.to('tempK').scalar)).toBe(0);
			expect(() => copy.add(copy)).toThrow();
			expect(() => copy.mul('2 m')).toThrow();
		}
	});
});

for (const Entry of [Quantity, RegexQuantity])
{
	describe(`numeric construction: ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {
		it('constructs dimensionless quantities from all supported numeric forms', () => {
			for (const input of [2.5, '2.5', new Decimal('2.5'), new Number(2.5), new String('2.5'),
				{ toString: () => '2.5' }, { toString: () => ' +2.5 ' }])
			{
				for (const units of [undefined, ''])
				{
					const q = new Entry(input, units);
					expect(q.scalar.toString()).toBe('2.5');
					expect(q.isUnitless()).toBe(true);
					expect(q.numerator).toEqual([]);
					expect(q.denominator).toEqual([]);
					expect(q.units()).toBe('');
					expect(q.eq(new Entry('2.5'))).toBe(true);
					expect(q.clone().isUnitless()).toBe(true);
				}
			}
		});

		it('preserves exact text and snapshots numeric objects after one conversion', () => {
			const text = '12345678901234567890.1234567890123456789';
			let calls = 0;
			const input = { toString() { calls++; return text; }, valueOf() { throw new Error('Must not coerce to number'); } };
			const q = new Entry(input);
			expect(calls).toBe(1);
			expect(q.scalar.eq(new Decimal(text))).toBe(true);
			expect(q.initValue).toBe(q.scalar);
			input.toString = () => '99';
			expect(q.clone().scalar.eq(new Decimal(text))).toBe(true);
			expect(calls).toBe(1);
		});

		it('respects isolated Decimal settings and numeric special values', () => {
			const Q = Entry.withConfig({ numeric: { precision: 3, minE: -5, maxE: 5 } });
			expect(new Q({ toString: () => '1e6' }).scalar.toString()).toBe('Infinity');
			expect(new Q(new Decimal('1e-6')).scalar.isZero()).toBe(true);
			expect(new Q(1.2345).add(0).scalar.toString()).toBe('1.23');
			expect(new Q(-0).scalar.isNeg()).toBe(true);
			expect(new Q(new Decimal('-0')).scalar.isNeg()).toBe(true);
			expect(new Q({ toString: () => '-0' }).scalar.isNeg()).toBe(true);
			expect(new Q(NaN).scalar.isNaN()).toBe(true);
			expect(new Q(Infinity).scalar.toString()).toBe('Infinity');
			expect(new Q(-Infinity).scalar.toString()).toBe('-Infinity');
			expect(new Q(2).config).toBe(Q.config);
		});

		it('supports numeric arithmetic while retaining dimensional compatibility checks', () => {
			const q = new Entry(2);
			expect(q.add(3).scalar.toString()).toBe('5');
			expect(q.sub(new Decimal('0.5')).scalar.toString()).toBe('1.5');
			expect(q.add({ toString: () => '0.5' }).scalar.toString()).toBe('2.5');
			expect(q.mul(new Number(3)).scalar.toString()).toBe('6');
			expect(q.div({ toString: () => '4' }).scalar.toString()).toBe('0.5');
			for (const input of [1, new Decimal(1), { toString: () => '1' }]) {
				expect(() => new Entry('2 m').add(input)).toThrow(/compatible/);
				expect(() => new Entry('2 m').sub(input)).toThrow(/compatible/);
			}
			const metres = new Entry({ toString: () => '2.5' }, 'm');
			expect(metres.scalar.toString()).toBe('2.5');
			expect(metres.units()).toBe('m');
		});

		it('rejects objects that do not provide a numeric string', () => {
			for (const input of [null, undefined, true, false, {}, [], { toString: null },
				{ toString: () => 2 }, { toString: () => '' }, { toString: () => '2 m' },
				{ toString: () => '1 + 2' }, { toString: () => '+-2' }, { toString: () => 'abc' }]) {
				expect(() => new Entry(input)).toThrow();
				expect(() => new Entry(input, 'm')).toThrow();
			}
			expect(() => new Entry({ toString() { throw new Error('Unreadable scalar'); } })).toThrow('Unreadable scalar');
		});

		it('rejects inherited, unknown and non-string unit tokens at construction', () => {
			const valid = { unit: '<meter>', exponent: 1 };
			const bad = ['toString', 'constructor', '__proto__', 'hasOwnProperty', '<unknown>',
				1, null, undefined, Symbol('unit'), { toString: () => '<meter>' }];
			for (const token of bad) for (const term of [{ ...valid, unit: token }, { ...valid, prefix: token }]) {
				if (token === undefined && term.unit === '<meter>') continue; // An omitted prefix is valid.
				for (const side of ['numerator', 'denominator'])
				{
					const definition = { scalar: new Decimal(1), numerator: [], denominator: [], [side]: [term] };
					expect(isQuantityDefinition(definition, testNumeric)).toBe(false);
					expect(() => new Entry(definition)).toThrow();
					const Custom = createQuantityClass({ numeric: testNumeric, parser: () => ({ parse: () => definition }) });
					expect(() => new Custom('anything')).toThrow();
				}
			}
			for (const input of ['toString', 'constructor', '__proto__']) expect(() => new Entry(input)).toThrow();
			expect(new Entry({ scalar: new Decimal(1), numerator: [valid], denominator: [] }).units()).toBe('m');
		});
	});
}

it('constructs numeric inputs without parsing but retains the core parser requirement', () => {
	let calls = 0;
	const parser = { parse() { calls++; throw new Error('Parser called'); } };
	const Custom = createQuantityClass({ numeric: testNumeric, parser: () => parser });
	for (const input of [2, new Decimal(2), { toString: () => '2' }])
	{
		expect(new Custom(input).add(1).scalar.toString()).toBe('3');
		expect(new Custom(input, undefined, parser).isUnitless()).toBe(true);
	}
	expect(calls).toBe(0);
	expect(() => new Custom('2')).toThrow('Parser called');
	expect(() => new Custom(2, undefined, null)).toThrow('A parser is required');
});
