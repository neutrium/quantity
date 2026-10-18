import { expect, it, vi } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';
import { NumberAdapter } from '@neutrium/utilities/number';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';

class QuantizedDecimal extends DecimalScientificAdapter
{
	from(value)
	{
		return super.add(super.from(value), super.from(0));
	}
}

class QuantizedArithmetic extends QuantizedDecimal
{
	toRationalTerm = undefined;
	fromRationalSum = undefined;
	compareRationalSum = undefined;
}

// Different input grids share native scalars and operations. Quantity must use
// the boundary belonging to each operand, independently of its representation.
class GridNumber extends NumberAdapter
{
	constructor(grid = 0)
	{
		super();
		this.grid = grid;
	}

	from(value)
	{
		const scalar = super.from(value);
		return this.grid ? Math.round(scalar / this.grid) * this.grid : scalar;
	}
}

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
