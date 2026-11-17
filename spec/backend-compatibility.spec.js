import { expect, it, vi } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';
import { parseRationalTerm } from '@neutrium/math/numeric/rational';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
import { Quantity as NumberQuantity } from '@neutrium/quantity/number';
import { Quantity } from '../dist/Quantity.js';
import { QuantizedArithmetic, QuantizedDecimal } from './helpers/temperature-adapters.js';

it.each([true, false])('requires a Quantity operand for same(), cache=%s', cache => {
	const Q = Quantity.withConfig({ cache });
	const length = new Q('2 m');
	const definition = { scalar: length.scalar, numerator: [{ unit: '<meter>', exponent: 1 }], denominator: [] };
	expect(() => length.same(definition)).toThrow(TypeError);
	definition.numerator[0].unit = '<second>';
	expect(() => length.same(definition)).toThrow(TypeError);
	expect(length.same(new Q(definition))).toBe(false);
});

class Scalar
{
	constructor(coefficient, scale)
	{
		this.coefficient = coefficient;
		this.scale = scale; Object.freeze(this);
	}
}

// Instances share prototype methods, but their encoded scalars are not
// interchangeable unless their scale matches. No diagnostic id distinguishes them.
class FixedAdapter
{
	id = 'fixed'; tier = 'arithmetic';
	constructor(scale) { this.scale = scale; }
	make(coefficient) { return new Scalar(coefficient, this.scale); }
	isValue(value) { return value instanceof Scalar && value.scale === this.scale; }
	from(value) { return this.make((value instanceof Scalar ? value.coefficient / value.scale : Number(value)) * this.scale); }
	toNumber(value) { return value.coefficient / value.scale; }
	toString(value) { return String(this.toNumber(value)); }
	toBytes() { return 16; }
	compare(a, b) { return a.coefficient < b.coefficient ? -1 : a.coefficient > b.coefficient ? 1 : 0; }
	isFinite(value) { return Number.isFinite(value.coefficient); }
	isNaN(value) { return Number.isNaN(value.coefficient); }
	isInteger(value) { return Number.isInteger(this.toNumber(value)); }
	add(a, b) { return this.make(a.coefficient + b.coefficient); }
	sub(a, b) { return this.make(a.coefficient - b.coefficient); }
	mul(a, b) { return this.make(a.coefficient * b.coefficient / this.scale); }
	div(a, b) { return this.make(a.coefficient * this.scale / b.coefficient); }
	rem(a, b) { return this.make(a.coefficient % b.coefficient); }
	neg(value) { return this.make(-value.coefficient); }
	abs(value) { return this.make(Math.abs(value.coefficient)); }
	powInteger(value, exponent) { return this.from(this.toNumber(value) ** exponent); }
	floor(value) { return this.from(Math.floor(this.toNumber(value))); }
	ceil(value) { return this.from(Math.ceil(this.toNumber(value))); }
	trunc(value) { return this.from(Math.trunc(this.toNumber(value))); }
	round(value) { return this.from(Math.round(this.toNumber(value))); }
}
const configure = numeric => createQuantityClass({ numeric, parser: c => new NearleyParser(c) });

it('recognizes Quantity operands before a structural scalar adapter can claim them', () => {
	class StructuralFixed extends FixedAdapter {
		isValue(v) { return typeof v?.coefficient === 'number' && v.scale === this.scale; }
		from(v) { return this.isValue(v) ? this.make(v.coefficient) : super.from(v); }
	}
	class Reading extends NumberQuantity {
		get coefficient() { return this.scalar; }
		get scale() { return 1; }
	}
	const numeric = new StructuralFixed(1), Q = configure(numeric);
	const length = new Q('2 m'), time = new Reading('2 s');
	expect(numeric.isValue(time)).toBe(true);
	for (const op of ['mul', 'div', 'compareTo', 'eq']) {
		expect(() => length[op](time), op).toThrow('Cannot mix numeric backends');
	}
	class FixedReading extends Q {
		get coefficient() { return this.scalar.coefficient; }
		get scale() { return 1; }
	}
	const duration = new FixedReading('2 s');
	expect(numeric.isValue(duration)).toBe(true);
	expect(length.mul(duration).isCompatible('m*s')).toBe(true);
	expect(length.div(duration).isCompatible('m/s')).toBe(true);
	expect(() => length.eq(duration)).toThrow(/incompatible/i);
	const scalar = { coefficient: 2, scale: 1 };
	expect(length.eq(scalar)).toBe(true);
	expect(length.mul(scalar).scalar.coefficient).toBe(4);
	expect(length.div(scalar).units()).toBe('m');
});

// Both adapters recognize the same scalars and share from/isValue. Only one
// exposes the optional rational interface; the other is a valid arithmetic adapter.
class ArithmeticOnlyDecimal extends DecimalScientificAdapter
{
	toRationalTerm = undefined;
	fromRationalSum = undefined;
	compareRationalSum = undefined;
}

for (const Parser of [NearleyParser, RegexParser]) for (const cache of [true, false])
{
	it(`uses the receiver's capabilities for compatible temperatures: ${Parser.name}, cache ${cache}`, () => {
		const Exact = createQuantityClass({ numeric: new DecimalScientificAdapter({ precision: 3 }), parser: c => new Parser(c), config: { cache } });
		const Basic = createQuantityClass({ numeric: new ArithmeticOnlyDecimal(), parser: c => new Parser(c), config: { cache } });
		// Adopting the operand by rounding before subtraction would lose this result.
		expect(new Exact('1000 tempK').sub(new Basic('1001 tempK')).scalar.eq(-1)).toBe(true);

		for (const [Left, Right] of [[Exact, Basic], [Basic, Exact]])
		{
			const left = new Left('20 tempC'), right = new Right('68 tempF');
			for (let repeat = 0; repeat < 2; repeat++) {
				expect(left.eq(right)).toBe(true);
				expect(left.gt(new Right('67 tempF'))).toBe(true);
				expect(left.lt(new Right('69 tempF'))).toBe(true);
				expect(left.eq(new Right('293.15 degK'))).toBe(true);
				expect(new Left('293.15 degK').eq(right)).toBe(true);
				const difference = left.sub(new Right('32 tempF'));
				expect(difference.scalar.eq(20)).toBe(true);
				expect(difference.units()).toBe('degC');
				expect(difference).toBeInstanceOf(Left);
				expect(left.sub(right).scalar.isZero()).toBe(true);
			}
		}
	});

	it(`preserves the source's represented boundary: ${Parser.name}, cache ${cache}`, () => {
		const Exact = createQuantityClass({ numeric: new QuantizedDecimal({ precision: 12 }), parser: c => new Parser(c), config: { cache } });
		const Basic = createQuantityClass({ numeric: new QuantizedArithmetic({ precision: 4 }), parser: c => new Parser(c), config: { cache } });
		const zero = new Basic('-273.15 tempC');
		expect(zero.scalar.eq('-273.2')).toBe(true);
		const reference = new Exact('0 tempK');

		for (let repeat = 0; repeat < 2; repeat++)
		{
			expect(reference.eq(zero)).toBe(true);
			expect(reference.sub(zero).scalar.isZero()).toBe(true);
			// Matching scale names do not imply matching represented offsets.
			expect(new Exact('-273.15 tempC').sub(zero).scalar.isZero()).toBe(true);
			expect(new Exact('20 tempC').sub(new Basic('20 tempC')).scalar.eq('-0.05')).toBe(true);
			expect(new Exact('-273.15 tempC').compareTo(zero)).toBe(0);
			expect(new Exact('20 tempC').compareTo(new Basic('20 tempC'))).toBe(-1);
		}
		const Narrow = createQuantityClass({ numeric: new QuantizedArithmetic({ maxE: 1 }), parser: c => new Parser(c), config: { cache } });
		// The source cannot represent its boundary; retain the exact catalog offset.
		expect(new Exact('293.15 tempK').eq(new Narrow('20 tempC'))).toBe(true);
	});

	it(`compares same-scale temperatures using both represented boundaries: ${Parser.name}, cache ${cache}`, () => {
		const configure = precision => createQuantityClass({ numeric: new QuantizedDecimal({ precision }),
			parser: c => new Parser(c), config: { cache } });
		const Exact = configure(12), Rounded = configure(4);
		for (const [unit, boundary] of [['tempC', '-273.15'], ['tempF', '-459.67']])
		{
			const exactZero = new Exact(boundary, unit), roundedZero = new Rounded(boundary, unit);
			const exact = new Exact(20, unit), rounded = new Rounded(20, unit);

			for (let repeat = 0; repeat < 2; repeat++)
			{
				for (const [a, b, order] of [[exactZero, roundedZero, 0], [roundedZero, exactZero, 0],
					[exact, rounded, -1], [rounded, exact, 1]])
				{
					expect(a.compareTo(b)).toBe(order);
					expect(a.eq(b)).toBe(order === 0);
					expect(a.lt(b)).toBe(order === -1);
					expect(a.lte(b)).toBe(order <= 0);
					expect(a.gt(b)).toBe(order === 1);
					expect(a.gte(b)).toBe(order >= 0);
				}
			}
		}
		expect(new Exact(Infinity, 'tempC').compareTo(new Rounded(Infinity, 'tempC'))).toBe(0);
		expect(new Exact(NaN, 'tempC').compareTo(new Rounded(20, 'tempC'))).toBeUndefined();
	});
}

it.each([true, false])('translates opaque temperature readings before applying the destination range, cache %s', cache => {
	class TenthsAdapter extends FixedAdapter
	{
		from(value) { return this.make(Math.round(super.from(value).coefficient)); }
	}
	const Exact = configure(new FixedAdapter(1)), Tenths = configure(new TenthsAdapter(10));
	const Narrow = Quantity.withConfig({ numeric: { maxE: 1 }, cache });
	for (const [unit, adjusted] of [['tempC', '19.95'], ['tempF', '20.03']])
	{
		for (let copy = 0; copy < 2; copy++)
		{
			expect(new Narrow(new Exact(20, unit)).scalar.toString()).toBe('20');
			expect(new Narrow(new Tenths(20, unit)).scalar.toString()).toBe(adjusted);
		}
	}
	// The source reading itself exceeds the destination range before translation.
	expect(new Narrow(new Tenths(100, 'tempC')).scalar.toString()).toBe('99.95');
});

it('compares same-adapter temperature readings without extracting rational terms', () => {
	const numeric = new DecimalScientificAdapter(), Q = configure(numeric);
	const a = new Q('20 tempC'), b = new Q('21 tempC');
	const extract = vi.spyOn(numeric, 'toRationalTerm');
	try
	{
		expect(a.compareTo(b)).toBe(-1);
		expect(a.compareTo(a)).toBe(0);
		expect(extract).not.toHaveBeenCalled();
	}
	finally
	{
		extract.mockRestore();
	}
});

it('exchanges incompatible rational representations without formatting or conversion through Number', () => {
	const decimal = new DecimalScientificAdapter();
	class RationalFixedAdapter extends FixedAdapter
	{
		toRationalTerm(value)
		{
			return {
				numerator: BigInt(value.coefficient),
				denominator: BigInt(this.scale),
				exponent: 0n
			};
		}
		fromRationalSum(terms)
		{
			return this.from(decimal.toNumber(decimal.fromRationalSum(terms)));
		}
		compareRationalSum(terms)
		{
			return decimal.compareRationalSum(terms);
		}
	}
	const numeric = new RationalFixedAdapter(3), Source = configure(numeric);
	const source = new Source({ scalar: numeric.make(1), numerator: [{ unit: '<meter>', exponent: 1 }], denominator: [] });
	const stringify = vi.spyOn(numeric, 'toString').mockImplementation(() => { throw new Error('No display conversion'); });
	const toNumber = vi.spyOn(numeric, 'toNumber').mockImplementation(() => { throw new Error('No lossy conversion'); });
	const Target = Quantity.withConfig({ numeric: { precision: 30 } });
	const copy = new Target(source);
	expect(copy.scalar.toString()).toBe('0.333333333333333333333333333333');
	expect(copy.units()).toBe('m');
	expect(stringify).not.toHaveBeenCalled();
	expect(toNumber).not.toHaveBeenCalled();
	toNumber.mockRestore();

	for (const value of [-0, NaN, Infinity, -Infinity])
	{
		const special = new Target(new Source(value, 'm'));
		expect(Object.is(special.numeric.toNumber(special.scalar), value)).toBe(true);
	}
});

it('rejects incompatible encoded scalars despite shared adapter methods, in both directions', () => {
	const a = new FixedAdapter(100), b = new FixedAdapter(1000);
	expect(a.from).toBe(b.from);
	expect(a.isValue).toBe(b.isValue);
	const A = configure(a), B = configure(b);
	const left = new A('1 m'), right = new B('1 m');
	for (const [receiver, other, Owner] of [[left, right, A], [right, left, B]])
	{
		expect(receiver.numeric.isValue(other.scalar)).toBe(false);

		for (const method of ['add', 'sub', 'mul', 'div', 'compareTo', 'eq', 'same'])
		{
			expect(() => receiver[method](other), method).toThrow('Cannot mix numeric backends');
		}

		const copy = new Owner(other);
		expect(copy.numeric.isValue(copy.scalar)).toBe(true);
		expect(copy.numeric.toNumber(copy.scalar)).toBe(1);
		expect(copy.same(receiver)).toBe(true);
	}
	const add = vi.spyOn(a, 'add'), compare = vi.spyOn(a, 'compare');
	expect(() => left.add(right)).toThrow('Cannot mix numeric backends');
	expect(() => left.compareTo(right)).toThrow('Cannot mix numeric backends');
	expect(add).not.toHaveBeenCalled();
	expect(compare).not.toHaveBeenCalled();
});

it('copies opaque scalars using the source adapter and preserves counted units without parsing', () => {
	const sourceAdapter = new FixedAdapter(1000), targetAdapter = new FixedAdapter(100);
	// Neither the scalar object nor generic Number coercion exposes its value.
	const source = new (configure(sourceAdapter))('12.5 cm3/s2');
	const parser = { parse: vi.fn(() => { throw new Error('Must not reparse units'); }) };
	const Target = createQuantityClass({ numeric: targetAdapter, parser: () => parser });
	const stringify = vi.spyOn(sourceAdapter, 'toString');
	const from = vi.spyOn(targetAdapter, 'from');
	const result = new Target(source);
	expect(stringify).toHaveBeenCalledExactlyOnceWith(source.scalar);
	expect(from).toHaveBeenCalledExactlyOnceWith('12.5');
	expect(result.scalar.coefficient).toBe(1250);
	expect(result.numerator).toEqual(source.numerator);
	expect(result.denominator).toEqual(source.denominator);
	expect(source.scalar.coefficient).toBe(12500);
	expect(parser.parse).not.toHaveBeenCalled();
});

it('allows compatible instances and explicit scalar conversion without changing units-only targets', () => {
	const a = new FixedAdapter(100), compatible = new FixedAdapter(100), other = new FixedAdapter(1000);
	const A = configure(a), B = configure(compatible), Other = configure(other);
	const left = new A('1 m'), right = new B('1 m'), incompatible = new Other('1 m');
	expect(a.toNumber(left.add(right).scalar)).toBe(2);
	expect(left.compareTo(right)).toBe(0);
	expect(left.same(new A(right))).toBe(true);
	expect(a.toNumber(left.add(new A(a.from(incompatible.scalar), 'm')).scalar)).toBe(2);
	expect(left.to(incompatible)).toBe(left); // Quantity targets supply units only.
});

it('validates the backend of operands returned by a subclass construction hook', () => {
	class Routed extends NumberQuantity {
		constructQuantity(input, units, parser) { return new Quantity(input, units, parser); }
	}
	const length = new Routed('2 m'), other = new Quantity('1 m');
	for (const method of ['add', 'sub', 'mul', 'div', 'compareTo']) {
		for (const input of ['1 m', other])
			expect(() => length[method](input), method).toThrow('Cannot mix numeric backends');
	}
	const definition = { scalar: other.scalar, numerator: other.numerator, denominator: other.denominator };
	expect(() => length.add(definition)).toThrow('Cannot mix numeric backends');
});

it.each([[true, false], [false, false], [true, true], [false, true]])('uses locally owned fractional temperature boundaries with shared integers, cache=%s, rational extraction=%s', (cache, extract) => {
	class OwnedFractions extends FixedAdapter {
		owned = new WeakSet();
		constructor(roundInputs) { super(1); this.roundInputs = roundInputs; }
		make(v) {
			const value = super.make(v);
			this.owned.add(value);
			return value;
		}
		isValue(v) { return super.isValue(v) && (Number.isInteger(v.coefficient) || this.owned.has(v)); }
		from(v) {
			const value = super.from(v);
			return this.roundInputs ? this.make(Math.round(value.coefficient * 10) / 10) : value;
		}
		toNumber(v) {
			if (!this.isValue(v)) throw new Error('foreign scalar');
			return super.toNumber(v);
		}
		compare(a, b) { return Math.sign(this.toNumber(a) - this.toNumber(b)); }
		sub(a, b) { return this.make(this.toNumber(a) - this.toNumber(b)); }
		add(a, b) { return this.make(this.toNumber(a) + this.toNumber(b)); }
	}
	const point = round => {
		const adapter = new OwnedFractions(round);
		if (extract) adapter.toRationalTerm = value => parseRationalTerm(adapter.toString(value));
		return configure(adapter).withConfig({ cache });
	};
	const A = point(false), B = point(false), C = point(true);
	const a = new A(20, 'tempC'), b = new B(20, 'tempC'), c = new C(20, 'tempC');
	for (const [left, right, difference] of [[a, b, 0], [a, c, 0.05], [c, a, -0.05]]) {
		expect(left.compareTo(right)).toBe(Math.sign(difference));
		expect(left.numeric.toNumber(left.sub(right).scalar)).toBeCloseTo(difference, 12);
	}
	expect(a.eq(new B(68, 'tempF'))).toBe(true);
	expect(a.numeric.toNumber(a.sub(new B(32, 'tempF')).scalar)).toBeCloseTo(20);
	const shifted = new A(2, 'degC').add(c), scaled = new A(2).mul(c);
	expect(a.numeric.toNumber(shifted.scalar)).toBeCloseTo(21.95);
	expect(a.numeric.toNumber(scaled.scalar)).toBeCloseTo(39.95);
	expect(a.numeric.toNumber(new A(-0).mul(b).scalar)).toBe(-0);
	expect(() => new A(-300, 'degC').add(c)).toThrow('absolute zero');
});
