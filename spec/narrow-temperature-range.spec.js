import { describe, expect, it } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { DecimalArithmeticAdapter } from '@neutrium/utilities/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';

for (const Adapter of [DecimalArithmeticAdapter, DecimalScientificAdapter])
{
	for (const Parser of [NearleyParser, RegexParser])
	{
		for (const cache of [true, false])
		{
			describe(`narrow temperature range: ${Adapter.name}, ${Parser.name}, cache ${cache}`, () => {
				const numeric = new Adapter({ maxE: 1, minE: -20 });
				const Q = createQuantityClass({ numeric, parser: c => new Parser(c), config: { cache } });

				it('rejects overflowed negative readings through every construction path', () => {
					for (const [value, unit] of [[-300, 'tempC'], [-500, 'tempF'], [-300, 'tempK'], [-500, 'tempR']]) {
						const units = new Q(0, unit);
						for (const construct of [
							() => new Q(`${value} ${unit}`),
							() => new Q(value, unit),
							() => new Q(numeric.from(value), unit),
							() => new Q(-Infinity, unit),
							() => new Q({ scalar: numeric.from(value), numerator: units.numerator, denominator: [] }),
						]) expect(construct).toThrow('absolute zero');
					}
					// A public copy also validates its scalar after adopting the
					// destination range; the source remains unchanged.
					const Wide = Q.withConfig({ numeric: { maxE: 10 } });
					const source = new Wide('-200 tempC');
					expect(() => new Q(source)).toThrow('absolute zero');
					expect(source.scalar.toString()).toBe('-200');
				});

				it('rejects unrepresentable valid outputs instead of storing negative infinity', () => {
					for (const target of ['tempC', 'tempF']) {
						for (const input of ['0 tempK', '1 tempK', '1e-20 mdegK']) {
							expect(() => new Q(input).to(target)).toThrow(RangeError);
						}
						const reciprocal = new Q(Infinity, '/degK');
						expect(() => reciprocal.to(target)).toThrow(RangeError);
					}
					for (const unit of ['tempC', 'tempF']) {
						const temperature = new Q(-4, unit);
						expect(() => temperature.mul(30)).toThrow(RangeError); // -120: valid but out of range.
						expect(() => temperature.div(0.025)).toThrow(RangeError); // -160
						expect(() => temperature.sub(new Q(99, unit === 'tempC' ? 'degC' : 'degF'))).toThrow(RangeError);
						expect(() => temperature.add(new Q(-99, unit === 'tempC' ? 'degC' : 'degF'))).toThrow(RangeError);
					}
					expect(() => new Q('-4 tempC').mul(99)).toThrow('absolute zero'); // -396: physically invalid.
					expect(() => new Q('-9 tempF').mul(99)).toThrow('absolute zero');
				});

				it('retains representable readings, positive overflow and valid underflow to zero', () => {
					for (const unit of ['tempC', 'tempF']) {
						const source = new Q(-99, unit);
						expect(source.clone().scalar.toString()).toBe('-99');
						expect(source.pow(1).scalar.toString()).toBe('-99');
						expect(source.toBase().scalar.toString()).toBe('Infinity');
						expect(new Q(Infinity, unit).scalar.toString()).toBe('Infinity');
						expect(new Q(NaN, unit).scalar.isNaN()).toBe(true);
					}
					for (const target of ['tempK', 'tempR']) {
						const zero = new Q('1e-20 mdegK').to(target);
						expect(zero.scalar.isZero()).toBe(true);
						expect(zero.clone().scalar.isZero()).toBe(true);
						expect(() => new Q('-1e-20 mdegK').to(target)).toThrow('absolute zero');
					}
				});
			});
		}
	}
}
