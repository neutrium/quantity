import { describe, expect, it } from 'vitest';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
import { createQuantityClass } from '../dist/factory.js';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';

// Equivalent finite values with fractional denominators exercise the public
// rational contract independently of Decimal's usual denominator-one encoding.
class FractionAdapter extends DecimalScientificAdapter
{
	toRationalTerm(value)
	{
		const term = super.toRationalTerm(value);

		return term.exponent < 0n
			? { numerator: term.numerator, denominator: 10n ** -term.exponent, exponent: 0n }
			: term;
	}
}

for (const cache of [true, false])
{
	describe(`custom rational representation, cache ${cache}`, () => {
		const configure = numeric => createQuantityClass({ numeric, parser: c => new NearleyParser(c), config: { cache } });
		const Q = configure(new FractionAdapter()), Reference = configure(new DecimalScientificAdapter());

		it('subtracts same-scale temperatures without discarding fractional denominators', () => {
			for (const scale of ['C', 'F', 'K', 'R']) {
				const result = new Q(`1.25 temp${scale}`).sub(`0.5 temp${scale}`);
				expect(result.scalar.eq('0.75')).toBe(true);
				expect(result.units()).toBe(`deg${scale}`);
			}
		});

		it('compares fractional magnitudes across units, including negative and unequal values', () => {
			for (const [left, right, expected] of [
				['0.5 m', '50 cm', 0], ['-0.5 m', '-50 cm', 0],
				['0.5 m', '51 cm', -1], ['0.5 m', '49 cm', 1],
				['-0.5 m', '-51 cm', 1], ['-0.5 m', '-49 cm', -1],
			]) {
				expect(new Q(left).compareTo(right)).toBe(expected);
				expect(new Q(right).compareTo(left)).toBe(expected === 0 ? 0 : -expected);
			}
		});

		it('retains denominators in exact, bounded and reciprocal conversions', () => {
			for (const [source, target] of [
				['0.5 ft', 'm'], ['-0.5 ft', 'm^-1'],
				['0.5 ft^5000', 'm^5000'], ['-0.5 ft^5000', 'm^5000'],
				['0.5 ft^5000', 'm^-5000'], ['-0.5 ft^5000', 'm^-5000'],
			]) {
				const expected = new Reference(source).to(target).scalar;
				const value = new Q(source);
				// Reuse the same inputs to exercise enabled caches too.
				for (let repeat = 0; repeat < 2; repeat++) expect(value.to(target).scalar.eq(expected)).toBe(true);
			}
		});

		it('retains both denominators in products, quotients and sums with bounded factors', () => {
			for (const power of [1, 5000]) {
				for (const op of ['add', 'sub', 'mul', 'div']) {
					for (const sign of ['', '-']) {
						const left = `0.25 m^${power}`, right = `${sign}0.5 ft^${power}`;
						const expected = new Reference(left)[op](right);
						const actual = new Q(left)[op](right);
						expect(actual.scalar.eq(expected.scalar), `${left} ${op} ${right}`).toBe(true);
						expect(actual.units()).toBe(expected.units());
					}
				}
			}
		});
	});
}
