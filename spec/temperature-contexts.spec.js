import { expect, it, vi } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';
import { floatAdapter } from './helpers/numeric.js';
import { QuantizedArithmetic, QuantizedDecimal } from './helpers/temperature-adapters.js';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';

it.each(['add', 'mul'])('applies receiver rounding to mixed-context identity %s', operation => {
	class Basic extends DecimalScientificAdapter {
		toRationalTerm = undefined;
		fromRationalSum = undefined;
		compareRationalSum = undefined;
	}
	const configure = precision => createQuantityClass({ numeric: new Basic({ precision }), parser: c => new RegexParser(c) });
	const Local = configure(3), Foreign = configure(20);
	const identity = operation === 'add' ? new Local('0 degC') : new Local(1);
	for (const scale of ['C', 'F', 'K', 'R']) {
		const unit = 'temp' + scale, point = new Foreign('1.2345', unit);
		expect(new Local(point).scalar.toString()).toBe('1.2345');
		expect(identity[operation](point).scalar.toString()).toBe('1.23');
		expect(identity[operation](point).same(identity[operation](new Local(point)))).toBe(true);
	}
});

it('applies native signed-zero addition across compatible temperature contexts', () => {
	const configure = () => createQuantityClass({ numeric: new NumberAdapter(), parser: c => new RegexParser(c) });
	const Local = configure(), Foreign = configure();
	for (const scale of ['C', 'F', 'K', 'R']) for (const zero of [0, -0]) {
		const interval = new Local(zero, 'mdegC'), point = new Foreign(-0, 'temp' + scale);
		expect(interval.add(point).scalar).toBe(interval.scalar + point.scalar);
	}
});

it('transfers the exact temperature literal even when a nearby double maps to the same source reading', () => {
	class StepThree extends BigIntAdapter {
		toRationalTerm = undefined;
		from(input) {
			const v = typeof input === 'number' ? BigInt(input) : super.from(input);
			const r = v % 3n;
			return v - r + (r === 2n ? 3n : r === -2n ? -3n : 0n);
		}
	}
	const configure = numeric => createQuantityClass({ numeric, parser: c => new RegexParser(c) });
	const adapter = new StepThree(), Source = configure(adapter), Target = configure(new DecimalScientificAdapter());
	for (const unit of ['tempK', 'tempR']) {
		const input = new Source('9007199254740993', unit);
		expect(adapter.toNumber(input.scalar)).toBe(9007199254740992);
		expect(adapter.from(adapter.toNumber(input.scalar))).toBe(input.scalar);
		expect(new Target(input).scalar.toString()).toBe('9007199254740993');
	}
});

it('translates a zero reading shifted by zero when the receiving boundary differs', () => {
	const configure = precision => createQuantityClass({ numeric: new QuantizedDecimal({ precision }), parser: c => new RegexParser(c) });
	const Coarse = configure(4), Wide = configure(12);
	const point = new Wide('-0', 'tempC'), interval = new Coarse('-0', 'degC');
	expect(interval.add(point).scalar.eq('-0.05')).toBe(true);
});

it.each([true, false])('adopts routed results just like a copy of the originating quantity, cache=%s', cache => {
	const configure = numeric => createQuantityClass({ numeric, parser: c => new RegexParser(c), config: { cache } });
	const Coarse = configure(new QuantizedDecimal({ precision: 4 }));
	for (const Destination of [configure(new QuantizedDecimal({ precision: 12 })), configure(new NumberAdapter())]) {
		class Routed extends Coarse {
			constructQuantity(input, units, parser) { return new Destination(input, units, parser); }
		}
		for (const input of ['2 m', '20 tempC', '-273.15 tempC']) {
			const source = new Routed(input), expected = new Destination(source);
			expect(source.clone().same(expected)).toBe(true);
			expect(source.mul(1).same(expected)).toBe(true);
		}
		const point = new Routed('20 tempC');
		expect(() => point.createResult(point.numeric.from(-300), point)).toThrow('absolute zero');
	}
});

it.each([true, false])('copies exact source terms into a construction-only temperature backend, cache=%s', cache => {
	const configure = numeric => createQuantityClass({ numeric, parser: c => new RegexParser(c), config: { cache } });
	const Source = configure(new QuantizedDecimal({ precision: 4 }));
	for (const maxE of [1, 2])
	{
		const target = new DecimalScientificAdapter({ maxE });
		target.toRationalTerm = undefined;
		target.compareRationalSum = undefined;
		const Target = configure(target);
		for (const [unit, minimum, expected] of [['tempC', '-273.15', '20.05'], ['tempF', '-459.67', '20.03']])
		{
			const reading = new Source(20, unit), zero = new Source(minimum, unit);
			for (let i = 0; i < 2; i++) expect(new Target(reading).scalar.eq(expected)).toBe(true);
			if (maxE === 1) expect(() => new Target(zero)).toThrow(RangeError);
			else expect(new Target(zero).scalar.eq(minimum)).toBe(true);
		}
	}
});

it.each([true, false])('preserves the source zero before destination rounding during copies, cache=%s', cache => {
	const configure = numeric => createQuantityClass({ numeric, parser: c => new RegexParser(c), config: { cache } });
	const Native = configure(new NumberAdapter());
	const Wide = configure(new DecimalScientificAdapter()), Narrow = configure(new DecimalScientificAdapter({ maxE: 1 }));
	const Float = configure(floatAdapter);
	const constructionOnly = new QuantizedDecimal({ precision: 4 });
	constructionOnly.toRationalTerm = undefined;
	constructionOnly.compareRationalSum = undefined;
	for (const [unit, expected] of [['tempC', '19.95'], ['tempF', '19.97']])
	{
		const wide = new Wide(20, unit), narrow = new Narrow(20, unit), native = new Native(20, unit);
		expect(new Float(narrow).scalar).toBe(new Float(wide).scalar);
		for (const adapter of [constructionOnly, new QuantizedArithmetic({ precision: 4 })])
		{
			const Target = configure(adapter);
			for (const source of [wide, native, narrow, native]) expect(new Target(source).scalar.eq(expected)).toBe(true);
		}
	}
});

// Different input grids share native scalars and operations. Quantity must use
// the boundary belonging to each operand, independently of its representation.
class GridNumber extends NumberAdapter
{
	constructor(grid = 0, max = Infinity)
	{
		super();
		this.grid = grid;
		this.max = max;
	}

	from(value)
	{
		const scalar = super.from(value);
		if (Math.abs(scalar) > this.max) return Math.sign(scalar) * Infinity;
		return this.grid ? Math.round(scalar / this.grid) * this.grid : scalar;
	}
}

it.each([true, false])('compares intervals with foreign points as represented by the receiver, cache=%s', cache => {
	const configure = numeric => createQuantityClass({ numeric, parser: c => new RegexParser(c), config: { cache } });
	const Narrow = configure(new GridNumber(0, 99)), Grid = configure(new GridNumber(0.25));
	const Wide = configure(new QuantizedDecimal({ precision: 12 })), Rounded = configure(new QuantizedDecimal({ precision: 4 }));

	for (const [interval, foreign, Receiver, order] of [
		[new Grid('273.25 degK'), new Narrow('0 tempC'), Grid, 1],
		[new Grid('459.75 degR'), new Narrow('0 tempF'), Grid, 1],
		[new Grid('1.25 degK'), new Narrow('1.125 tempK'), Grid, 0],
		[new Grid('1 degR'), new Narrow('1.125 tempR'), Grid, -1],
		[new Rounded('23.1 degK'), new Wide('-250.0123 tempC'), Rounded, 0],
	]) {
		const local = new Receiver(foreign);
		expect(interval.compareTo(local)).toBe(order);
		expect(interval.compareTo(foreign)).toBe(order);
	}

	const Limited = configure(new QuantizedDecimal({ maxE: 1 }));
	const zero = new Wide('-273.15 tempC');
	expect(() => new Limited(zero)).toThrow(RangeError);
	expect(() => new Limited('0 degK').compareTo(zero)).toThrow(RangeError);
});

it('uses compatible temperature scalars directly when only input construction rounds', () => {
	const configure = grid => createQuantityClass({ numeric: new GridNumber(grid), parser: c => new RegexParser(c) });
	const Source = configure(0), Receiver = configure(0.25);
	const point = new Source(1.125, 'tempK');
	expect(new Receiver(point).scalar).toBe(1.25);
	expect(new Receiver('0 degK').add(point).scalar).toBe(1.125);
	expect(new Receiver(1).mul(point).scalar).toBe(1.125);
});

it('preserves arithmetic signed zero at a represented Celsius or Fahrenheit boundary of zero', () => {
	const configure = () => createQuantityClass({ numeric: new GridNumber(1024), parser: c => new RegexParser(c) });
	const Source = configure(), Receiver = configure();
	for (const unit of ['tempC', 'tempF']) for (const reading of [0, -0]) {
		const point = new Source(reading, unit);
		for (const delta of [0, -0]) {
			const interval = new Receiver(delta, 'degK');
			expect(interval.add(point).scalar).toBe(delta + reading);
		}
	}
});

it.each([
	['native', () => new GridNumber(0.25), () => new GridNumber()],
	['arithmetic', () => new QuantizedArithmetic({ precision: 4 }), () => new QuantizedArithmetic({ precision: 12 })],
	['lower precision arithmetic receiver', () => new QuantizedArithmetic({ precision: 12 }), () => new QuantizedArithmetic({ precision: 4 })],
	['narrow arithmetic receiver', () => new QuantizedArithmetic({ precision: 4 }), () => new QuantizedArithmetic({ maxE: 1 })],
	['narrow arithmetic source', () => new QuantizedArithmetic({ maxE: 1 }), () => new QuantizedArithmetic({ precision: 4 })],
	['rational', () => new QuantizedDecimal({ precision: 4 }), () => new QuantizedDecimal({ precision: 12 })],
])('%s temperature copies, interval addition and comparisons agree across cache modes', (_, source, receiver) => {
	const readings = [true, false].map(cache => {
		const configure = numeric => createQuantityClass({ numeric, parser: c => new RegexParser(c), config: { cache } });
		const Source = configure(source()), Receiver = configure(receiver());
		return ['tempC', 'tempF'].map(unit => {
			const point = new Source(20, unit), copy = new Receiver(point);
			const shifted = new Receiver(0, unit.replace('temp', 'deg')).add(point);
			expect(shifted.same(copy)).toBe(true);
			expect(new Receiver(1).mul(point).same(copy)).toBe(true);
			expect(copy.compareTo(point)).toBe(0);
			expect(copy.sub(point).eq(0)).toBe(true);
			return copy.scalar.toString();
		});
	});
	expect(readings[0]).toEqual(readings[1]);
});

it.each([true, false])('compares and subtracts across scales when the source boundary overflows, cache=%s', cache => {
	const configure = numeric => createQuantityClass({ numeric, parser: c => new RegexParser(c), config: { cache } });
	const Wide = configure(new QuantizedArithmetic({ precision: 12 }));
	const Narrow = configure(new QuantizedArithmetic({ maxE: 1 }));
	for (const [local, foreign, warmer] of [['68 tempF', '20 tempC', '21 tempC'], ['20 tempC', '68 tempF', '69 tempF']])
	{
		const a = new Wide(local), b = new Narrow(foreign), c = new Narrow(warmer);
		expect(a.compareTo(b)).toBe(0);
		expect(a.sub(b).scalar.isZero()).toBe(true);
		expect(a.compareTo(c)).toBe(-1);
		expect(a.sub(c).same(a.sub(new Wide(c)))).toBe(true);
	}
});

it.each([true, false])('translates mixed-context identity operations before receiver rounding, cache=%s', cache => {
	const configure = precision => createQuantityClass({ numeric: new QuantizedArithmetic({ precision }),
		parser: c => new RegexParser(c), config: { cache } });
	const Source = configure(12), Receiver = configure(4);
	const one = new Receiver(1), zero = new Receiver('0 degF');
	for (const [unit, reading, expected] of [
		['tempC', '-273.15', '-273.2'], ['tempF', '-459.67', '-459.7'],
		['tempC', '0.123456', '0.07346'], ['tempF', '0.123456', '0.09346'],
	]) {
		const point = new Source(reading, unit), copy = new Receiver(point);
		expect(copy.scalar.eq(expected)).toBe(true);
		expect(zero.add(point).same(copy)).toBe(true);
		expect(one.mul(point).same(copy)).toBe(true);
	}
});

it.each([true, false])('checks a mixed-context product before rounding to the receiver boundary, cache=%s', cache => {
	const configure = options => createQuantityClass({ numeric: new QuantizedArithmetic(options),
		parser: c => new RegexParser(c), config: { cache } });
	const Source = configure({ precision: 12 });
	for (const rounding of ['half-up', 'down', 'ceil', 'floor'])
	{
		const Receiver = configure({ precision: 4, rounding }), factor = new Receiver(2);
		for (const [unit, half, warmer, colder] of [
			['tempC', '-136.575', '-136.574', '-136.576'],
			['tempF', '-229.835', '-229.834', '-229.836'],
		]) {
			const zero = new Receiver(0, 'tempK').to(unit);
			expect(factor.mul(new Source(half, unit)).same(zero)).toBe(true);
			expect(factor.mul(new Source(warmer, unit)).gte(zero)).toBe(true);
			expect(() => factor.mul(new Source(colder, unit))).toThrow('absolute zero');
		}
	}
});

it.each([true, false])('scales a foreign reading when its source cannot represent absolute zero, cache=%s', cache => {
	const configure = numeric => createQuantityClass({ numeric, parser: c => new RegexParser(c), config: { cache } });
	const Source = configure(new QuantizedArithmetic({ maxE: 1 }));
	const Receiver = configure(new QuantizedArithmetic({ precision: 12 }));

	const point = new Source('-50 tempC');
	expect(new Receiver(3).mul(point).scalar.toString()).toBe('-150');
	expect(() => new Receiver(6).mul(point)).toThrow('absolute zero');

	const factor = new Receiver(5);
	for (const [unit, warmer, endpoint, colder, minimum] of [
		['tempC', '-54.629', '-54.63', '-54.631', '-273.15'],
		['tempF', '-91.933', '-91.934', '-91.935', '-459.67'],
	]) {
		const valid = new Source(warmer, unit);
		expect(factor.mul(valid).same(factor.mul(new Receiver(valid)))).toBe(true);
		expect(factor.mul(new Source(endpoint, unit)).scalar.toString()).toBe(minimum);
		expect(() => factor.mul(new Source(colder, unit))).toThrow('absolute zero');
	}
});

it.each([true, false])('distinguishes temperature overflow from below absolute zero across adapter instances, cache=%s', cache => {
	const configure = options => createQuantityClass({ numeric: new QuantizedArithmetic(options),
		parser: c => new RegexParser(c), config: { cache } });
	const Narrow = configure({ maxE: 1 }), Wide = configure({ maxE: 2 });

	for (const Point of [Narrow, configure({ maxE: 1 })]) {
		expect(() => new Narrow(3).mul(new Point('-50 tempC'))).toThrow(RangeError);
		expect(() => new Narrow('-75 degC').add(new Point('-75 tempC'))).toThrow(RangeError);
	}

	for (const Point of [Wide, configure({ maxE: 2 })]) {
		const point = new Point('-50 tempC');
		expect(new Wide(3).mul(point).scalar.eq(-150)).toBe(true);
		expect(new Wide('-75 degC').add(new Point('-75 tempC')).scalar.eq(-150)).toBe(true);
		expect(() => new Wide(6).mul(point)).toThrow('absolute zero');
	}

	const cooling = new Narrow('-75 degC');
	expect(() => cooling.add(new Wide('-75 tempC'))).toThrow(RangeError);
	expect(() => cooling.add(new Wide('-225 tempC'))).toThrow('absolute zero');
	expect(() => new Narrow(6).mul(new Wide('-50 tempC'))).toThrow('absolute zero');

	// Both operations give -99.9 before the source's rounded zero adds a -0.15 offset.
	const Rounded = configure({ precision: 3 }), point = new Rounded('-33.3 tempC');
	expect(() => new Narrow(3).mul(point)).toThrow(RangeError);
	expect(() => new Narrow('-66.6 degC').add(point)).toThrow(RangeError);
});

for (const Parser of [NearleyParser, RegexParser]) for (const cache of [true, false])
{
	const configure = numeric => createQuantityClass({ numeric, parser: c => new Parser(c), config: { cache } });

	for (const Adapter of [QuantizedDecimal, QuantizedArithmetic])
	{
		it(`shifts temperatures using the source boundary: ${Adapter.name}, ${Parser.name}, cache ${cache}`, () => {
			const Exact = configure(new Adapter({ precision: 12 }));
			const Rounded = configure(new Adapter({ precision: 4 }));

			for (const [unit, degrees, boundary] of [['tempC', 'degC', '-273.15'], ['tempF', 'degF', '-459.67']])
			{
				for (const [Receiver, Source] of [[Exact, Rounded], [Rounded, Exact]])
				{
					const zero = new Source(boundary, unit);

					for (let repeat = 0; repeat < 2; repeat++)
					{
						const unchanged = new Receiver(0, degrees).add(zero);
						expect(new Receiver(zero).same(unchanged)).toBe(true);
					expect(unchanged).toBeInstanceOf(Receiver);
						expect(unchanged.units()).toBe(unit);
						expect(unchanged.to('tempK').scalar.isZero()).toBe(true);
						expect(() => new Receiver('-0.01', degrees).add(zero)).toThrow('absolute zero');
						const warm = new Receiver(1, degrees).add(zero);
						const expected = new Receiver(boundary, unit).add(new Receiver(1, degrees));
						expect(warm.scalar.eq(expected.scalar)).toBe(true);
						expect(zero.add(new Receiver(1, degrees))).toBeInstanceOf(Source);
						expect(() => zero.sub(new Receiver('0.01', degrees))).toThrow('absolute zero');
					}
				}

				// Apply the receiver's final rounding after offset translation.
				expect(new Exact(1, degrees).add(new Rounded(20, unit)).scalar.eq(unit === 'tempC' ? '21.05' : '21.03')).toBe(true);
				expect(new Exact(1000, 'm' + degrees).add(new Rounded(20, unit)).scalar.eq(unit === 'tempC' ? '21.05' : '21.03')).toBe(true);
			}
		});

		it(`scales source readings before translating their boundary: ${Adapter.name}, ${Parser.name}, cache ${cache}`, () => {
			const Exact = configure(new Adapter({ precision: 12 }));
			const Rounded = configure(new Adapter({ precision: 4 }));

			for (const [unit, boundary, shift] of [['tempC', '-273.15', '0.05'], ['tempF', '-459.67', '0.03']])
			{
				const zero = new Rounded(boundary, unit);
				const identity = new Exact(1).mul(zero);
				expect(identity).toBeInstanceOf(Exact);
				expect(identity.to('tempK').scalar.isZero()).toBe(true);
				expect(() => new Exact('1.001').mul(zero)).toThrow('absolute zero');
				const product = new Exact(2).mul(new Rounded(20, unit));
				expect(product.scalar.eq(product.numeric.add(product.numeric.from(40), product.numeric.from(shift)))).toBe(true);
				// Scaling is still of the displayed reading, not of kelvin.
				expect(new Exact(0).mul(zero).scalar.eq(shift)).toBe(true);

				if (Adapter === QuantizedDecimal)
				{
					expect(new Rounded(1).mul(new Exact(boundary, unit)).to('tempK').scalar.isZero()).toBe(true);
					expect(() => new Rounded('1.001').mul(new Exact(boundary, unit))).toThrow('absolute zero');
				}
			}
		});
	}

	it(`translates native temperature contexts without serialization: ${Parser.name}, cache ${cache}`, () => {
		const a = new GridNumber(), b = new GridNumber(0.25);
		const A = configure(a), B = configure(b);

		for (const [unit, degrees, boundary] of [['tempC', 'degC', '-273.15'], ['tempF', 'degF', '-459.67']])
		{
			const zero = new B(boundary, unit), reference = new A(boundary, unit);
			const zeroInterval = new A(0, degrees), cold = new A(-0.25, degrees), one = new A(1);
			const warm = new A(1, degrees), lowZeroInterval = new B(0, degrees), lowOne = new B(1);
			const stringify = vi.spyOn(a, 'toString').mockImplementation(() => { throw new Error('No scalar formatting'); });

			try
			{
				expect(zeroInterval.add(zero).scalar).toBe(reference.scalar);
				expect(lowZeroInterval.add(reference).scalar).toBe(zero.scalar);
				expect(() => cold.add(zero)).toThrow('absolute zero');
				expect(one.mul(zero).scalar).toBe(reference.scalar);
				expect(lowOne.mul(reference).scalar).toBe(zero.scalar);
				expect(warm.add(zero).scalar).toBe(reference.scalar + 1);
			}
			finally
			{
				stringify.mockRestore();
			}
		}
	});

	it(`validates scalar multiplication at the temperature operand's zero: ${Parser.name}, cache ${cache}`, () => {
		const Exact = configure(new GridNumber()), Coarse = configure(new GridNumber(1024));
		const factor = new Coarse(1024);
		for (const [unit, minimum] of [['tempC', -273.15], ['tempF', -459.67]]) {
			const reading = new Exact(minimum / 1024, unit);
			const product = factor.mul(reading);
			expect(product).toBeInstanceOf(Coarse);
			expect(product.scalar).toBe(new Coarse(0, 'tempK').to(unit).scalar);
			expect(factor.mul(new Exact(-0.125, unit)).scalar).toBe(-128 - minimum);
			expect(() => factor.mul(new Exact(-1, unit))).toThrow('absolute zero');
			// The reverse operation has a source boundary of zero and a negative product.
			expect(() => new Exact(-1).mul(new Coarse(1024, unit))).toThrow('absolute zero');
		}
	});

	it(`shifts compatible contexts with different rational capabilities: ${Parser.name}, cache ${cache}`, () => {
		const Exact = configure(new QuantizedDecimal({ precision: 12 }));
		const Basic = configure(new QuantizedArithmetic({ precision: 4 }));

		for (const [Receiver, Source] of [[Exact, Basic], [Basic, Exact]])
		{
			const zero = new Source('-273.15 tempC');
			expect(new Receiver('0 degC').add(zero).to('tempK').scalar.isZero()).toBe(true);
			expect(() => new Receiver('-0.01 degC').add(zero)).toThrow('absolute zero');
			expect(new Receiver(Infinity, 'degC').add(zero).scalar.toString()).toBe('Infinity');
			expect(new Receiver(NaN, 'degC').add(zero).scalar.isNaN()).toBe(true);
			expect(() => new Receiver(-Infinity, 'degC').add(zero)).toThrow('absolute zero');
			expect(new Receiver(0).mul(new Source(Infinity, 'tempC')).scalar.isNaN()).toBe(true);
		}
	});

	it(`applies final range limits after translating temperature contexts: ${Parser.name}, cache ${cache}`, () => {
		const Wide = configure(new DecimalScientificAdapter());
		const Narrow = configure(new DecimalScientificAdapter({ maxE: 1 }));

		for (const unit of ['tempC', 'tempF'])
		{
			const zero = new Wide(0, 'tempK').to(unit);
			const narrowReading = new Narrow(20, unit);
			expect(new Wide('0 degC').add(narrowReading).scalar.eq(20)).toBe(true);
			expect(new Wide(1).mul(narrowReading).scalar.eq(20)).toBe(true);
			expect(new Narrow('0 degC').add(new Wide(20, unit)).scalar.eq(20)).toBe(true);
			expect(() => new Narrow('0 degC').add(zero)).toThrow(RangeError);
			expect(() => new Narrow(1).mul(zero)).toThrow(RangeError);
			expect(() => new Narrow('-0.01 degC').add(zero)).toThrow('absolute zero');
		}
	});

	it(`validates represented scaled readings before subtracting their boundary: ${Parser.name}, cache ${cache}`, () => {
		const Receiver = configure(new QuantizedArithmetic({ precision: 12, minE: -1 }));
		const Source = configure(new QuantizedArithmetic({ precision: 4 }));
		const zero = new Source('-273.15 tempC');
		const factor = new Receiver('1.0001');
		// Both readings are representable; only their small difference underflows.
		const invalid = factor.numeric.mul(factor.scalar, zero.scalar);
		expect(factor.numeric.compare(invalid, zero.scalar)).toBe(-1);
		expect(factor.numeric.sub(invalid, zero.scalar).isZero()).toBe(true);
		expect(() => factor.mul(zero)).toThrow('absolute zero');
	});

	it(`preserves arithmetic-only boundaries in same-scale operations: ${Parser.name}, cache ${cache}`, () => {
		const Exact = configure(new QuantizedArithmetic({ precision: 12 }));
		const Rounded = configure(new QuantizedArithmetic({ precision: 4 }));
		const nearZero = new Exact('-273.14 tempC');
		expect(new Rounded('-0.01 degC').add(nearZero).scalar.eq('-273.2')).toBe(true);
		expect(() => new Rounded('-0.011 degC').add(nearZero)).toThrow('absolute zero');

		for (const [unit, boundary, difference] of [['tempC', '-273.15', '-0.05'], ['tempF', '-459.67', '-0.03']])
		{
			const aZero = new Exact(boundary, unit), bZero = new Rounded(boundary, unit);
			const a = new Exact(20, unit), b = new Rounded(20, unit);

			for (let repeat = 0; repeat < 2; repeat++)
			{
				expect(aZero.eq(bZero)).toBe(true);
				expect(bZero.eq(aZero)).toBe(true);
				expect(aZero.sub(bZero).scalar.isZero()).toBe(true);
				expect(bZero.sub(aZero).scalar.isZero()).toBe(true);
				expect(a.compareTo(b)).toBe(-1);
				expect(b.compareTo(a)).toBe(1);
				expect(a.sub(b).scalar.eq(difference)).toBe(true);
				expect(b.sub(a).scalar.eq(a.numeric.neg(a.numeric.from(difference)))).toBe(true);
				expect(a.sub(b).units()).toBe(unit.replace('temp', 'deg'));
			}
		}
	});

	it(`preserves arithmetic-only boundaries across temperature scales: ${Parser.name}, cache ${cache}`, () => {
		const Exact = configure(new QuantizedArithmetic({ precision: 12 }));
		const Rounded = configure(new QuantizedArithmetic({ precision: 4 }));

		for (const [unit, boundary] of [['tempC', '-273.15'], ['tempF', '-459.67']])
		{
			const zero = new Rounded(boundary, unit), reference = new Exact('0 tempK');

			for (let repeat = 0; repeat < 2; repeat++)
			{
				expect(reference.eq(zero)).toBe(true);
				expect(zero.eq(reference)).toBe(true);
				expect(reference.sub(zero).scalar.isZero()).toBe(true);
				expect(zero.sub(reference).scalar.isZero()).toBe(true);
				expect(new Exact('1 tempK').sub(zero).scalar.eq(1)).toBe(true);
			}
		}

		expect(new Exact('-273.15 tempC').sub(new Rounded('-459.67 tempF')).scalar.isZero()).toBe(true);
		expect(new Rounded('-459.67 tempF').eq(new Exact('-273.15 tempC'))).toBe(true);
	});

	it(`compares equivalent native contexts without adding offsets: ${Parser.name}, cache ${cache}`, () => {
		const numeric = new NumberAdapter(), A = configure(numeric), B = configure(new NumberAdapter());

		for (const unit of ['tempC', 'tempF', 'tempK', 'tempR']) for (const tiny of [1e-15, Number.MIN_VALUE])
		{
			const a = new A(tiny, unit), b = new B(2 * tiny, unit);
			const subtract = vi.spyOn(numeric, 'sub');
			const stringify = vi.spyOn(numeric, 'toString').mockImplementation(() => { throw new Error('No scalar formatting'); });

			try
			{
				for (let repeat = 0; repeat < 2; repeat++)
				{
					expect(a.compareTo(b)).toBe(-1);
					expect(b.compareTo(a)).toBe(1);
					expect(a.eq(b)).toBe(false);
				}

				expect(new B(0, unit.replace('temp', 'deg')).add(a).scalar).toBe(tiny);
				expect(new B(1).mul(a).scalar).toBe(tiny);
				expect(subtract).not.toHaveBeenCalled();
				expect(a.sub(b).scalar).toBe(-tiny);
				expect(b.sub(a).scalar).toBe(tiny);
			}
			finally
			{
				subtract.mockRestore(); stringify.mockRestore();
			}
		}
		expect(new A(Infinity, 'tempC').compareTo(new B(Infinity, 'tempC'))).toBe(0);
		expect(new A(NaN, 'tempC').compareTo(new B(20, 'tempC'))).toBeUndefined();
		expect(new A(Infinity, 'tempC').sub(new B(Infinity, 'tempC')).scalar).toBeNaN();
		expect(new A(-0, 'tempC').compareTo(new B(0, 'tempC'))).toBe(0);
		expect(new A(-0, 'tempC').sub(new B(0, 'tempC')).scalar).toBe(-0);
	});
}

it.each([true, false])('derives physical temperature behavior from the target units, cache=%s', cache => {
	const Q = createQuantityClass({ numeric: new NumberAdapter(), parser: c => new RegexParser(c), config: { cache } });
	class LabelledTarget extends Q { isTemperature() { return false; } }
	const custom = new LabelledTarget('tempC');
	for (const targets of [[custom, 'tempC'], ['tempC', custom]]) {
		const source = new Q('20 degC');
		for (const target of targets) expect(source.to(target).scalar).toBeCloseTo(-253.15);
	}
	expect(() => new LabelledTarget('-274 tempC')).toThrow('absolute zero');
	expect(() => custom.add(custom)).toThrow('Cannot add two temperatures');
	expect(() => custom.inverse()).toThrow('Cannot divide with temperatures');
	class LabelledBase extends Q { isBase() { return true; } }
	const point = new LabelledBase('20 tempC');
	expect(point.baseScalar).toBeCloseTo(293.15);
	expect(point.toBase().units()).toBe('tempK');
	expect(point.toBase().scalar).toBeCloseTo(293.15);
	class LabelledUnitless extends Q { isUnitless() { return true; } }
	const length = new LabelledUnitless('1 m');
	expect(() => point.mul(length)).toThrow('Cannot multiply by temperatures');
	expect(() => length.mul(point)).toThrow('Cannot multiply by temperatures');
	expect(() => point.div(length)).toThrow('Cannot divide with temperatures');
	class Restricted extends Q {
		acceptsTarget = true;
		isCompatible(target) { return this.acceptsTarget && super.isCompatible(target); }
	}
	const restricted = new Restricted('20 degC');
	expect(restricted.to('tempC').scalar).toBeCloseTo(-253.15);
	restricted.acceptsTarget = false;
	expect(() => restricted.to('tempC')).toThrow(/incompatible/i);
	expect(() => restricted.to(custom)).toThrow(/incompatible/i);
});

it.each([true, false])('preserves owned decimal fractions in mixed temperature operations, cache=%s', cache => {
	const exact = new DecimalScientificAdapter({ precision: 40 });
	// Integers are shared JS primitives. Each instance owns its fractional decimals.
	class SharedIntegers extends NumberAdapter {
		owned = new WeakSet();
		constructor(minimum) { super(); this.minimum = minimum; }
		box(x) {
			if (exact.isInteger(x) && Number.isSafeInteger(exact.toNumber(x))) return exact.toNumber(x);
			this.owned.add(x); return x;
		}
		isValue(x) { return Number.isSafeInteger(x) || this.owned.has(x); }
		read(x) {
			if (!this.isValue(x)) throw new Error('foreign scalar');
			return typeof x === 'number' ? exact.from(x) : x;
		}
		from(x) { return this.box(exact.from(x === '-273.15' ? this.minimum : x)); }
		toString(x) { return exact.toString(this.read(x)); }
		toNumber(x) { return exact.toNumber(this.read(x)); }
		isInteger(x) { return exact.isInteger(this.read(x)); }
		isFinite(x) { return exact.isFinite(this.read(x)); }
		compare(a, b) { return exact.compare(this.read(a), this.read(b)); }
		add(a, b) { return this.box(exact.add(this.read(a), this.read(b))); }
		sub(a, b) { return this.box(exact.sub(this.read(a), this.read(b))); }
		mul(a, b) { return this.box(exact.mul(this.read(a), this.read(b))); }
		div(a, b) { return this.box(exact.div(this.read(a), this.read(b))); }
	}
	const make = minimum => createQuantityClass({ numeric: new SharedIntegers(minimum), parser: c => new RegexParser(c), config: { cache } });
	const A = make('-273.15'), B = make('-273.15000000000000000001');
	const a = new A(20, 'tempC'), b = new B(20, 'tempC');
	expect(a.compareTo(b)).toBe(-1);
	expect(b.compareTo(a)).toBe(1);
	const value = q => exact.from(q.numeric.toString(q.scalar));
	expect(value(a.sub(b)).eq('-1e-20')).toBe(true);
	expect(value(new A(b)).eq('20.00000000000000000001')).toBe(true);
	expect(value(new A(2, 'degC').add(b)).eq('22.00000000000000000001')).toBe(true);
	expect(value(new A(2).mul(b)).eq('40.00000000000000000001')).toBe(true);
	for (const unit of ['tempK', 'tempR', 'tempF', 'tempC']) {
		const reading = new B('1.00000000000000000001', unit);
		const expected = unit === 'tempC' ? '1.00000000000000000002' : '1.00000000000000000001';
		expect(value(new A(reading)).eq(expected), unit).toBe(true);
	}
	const precise = new B('1.00000000000000000001', 'tempK');
	const roundedDisplay = vi.spyOn(precise.numeric, 'toString').mockReturnValue('1');
	try { expect(() => new A(precise)).toThrow('round-trippable'); }
	finally { roundedDisplay.mockRestore(); }
});

it.each([true, false])('uses catalog offsets outside the arithmetic adapter range, cache=%s', cache => {
	const Q = createQuantityClass({ numeric: new QuantizedArithmetic({ maxE: 1, precision: 15 }), parser: c => new RegexParser(c), config: { cache } });
	const c = new Q('20 tempC'), f = new Q('68 tempF');
	expect(c.to('tempF').scalar.eq(68)).toBe(true);
	expect(f.to('tempC').scalar.eq(20)).toBe(true);
	expect(c.compareTo(f)).toBe(0);
	expect(c.compareTo('69 tempF')).toBe(-1);
	expect(c.sub(f).scalar.isZero()).toBe(true);
	expect(c.sub('50 tempF').scalar.eq(10)).toBe(true);
	expect(() => new Q('1 tempK').to('tempC')).toThrow(RangeError);
	expect(() => new Q('-4 tempC').mul(30)).toThrow(RangeError);
	expect(() => new Q('-4 tempC').mul(99)).toThrow(RangeError);
	expect(() => new Q('-4 tempC').sub('99 degC')).toThrow(RangeError);
	// The receiver overflows while converting the interval into Fahrenheit degrees.
	expect(new Q('-90 tempF').add('90 degC').scalar.toNumber()).toBe(Infinity);
});

it.each([true, false])('uses the receiver’s numerical range for affine temperature conversions, cache=%s', cache => {
	const configure = numeric => createQuantityClass({ numeric, parser: c => new RegexParser(c), config: { cache } });
	const options = { maxE: 2, precision: 12 };
	const exact = configure(new QuantizedDecimal(options)), arithmetic = configure(new QuantizedArithmetic(options));
	expect(new exact('600 tempK').to('tempF').scalar.eq('620.33')).toBe(true);
	expect(new arithmetic('600 tempK').to('tempF').scalar.toNumber()).toBe(Infinity);
	expect(new exact('980 tempF').toBase().scalar.eq('799.816666667')).toBe(true);
	expect(new arithmetic('980 tempF').toBase().scalar.toNumber()).toBe(Infinity);
});

it('operates on representable positive temperatures and intervals without requiring a dummy zero', () => {
	class PositiveInputs extends NumberAdapter {
		from(x) { const v = super.from(x); if (v === 0) throw new Error('Zero input unavailable'); return v; }
	}
	const Q = createQuantityClass({ numeric: new PositiveInputs(), parser: c => new RegexParser(c) });
	const c = new Q('20 tempC'), d = new Q('9 degF');
	expect(c.add(d).scalar).toBe(25);
	expect(c.to('tempF').scalar).toBeCloseTo(68);
	expect(d.to('degC').scalar).toBe(5);
	expect(d.gt('4 degC')).toBe(true);
	expect(d.inverse().scalar).toBe(1 / 9);
});

it('copies exactly transferable opaque readings to native numbers when formatting is unavailable', () => {
	const source = new QuantizedArithmetic({ precision: 15 });
	const A = createQuantityClass({ numeric: source, parser: c => new RegexParser(c) });
	const B = createQuantityClass({ numeric: new NumberAdapter(), parser: c => new RegexParser(c) });
	const point = new A('1.125 tempR'), zero = new A('-0 tempK');
	const format = vi.spyOn(source, 'toString').mockImplementation(() => { throw new Error('display disabled'); });
	try {
		expect(new B(point).scalar).toBe(1.125);
		expect(new B(zero).scalar).toBe(source.toNumber(zero.scalar));
	} finally { format.mockRestore(); }
});
