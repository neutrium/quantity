import { describe, expect, it } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const decimalAdapter = new DecimalScientificAdapter();
import { NumberAdapter } from '@neutrium/utilities/number';
const numberAdapter = new NumberAdapter();
import { floatAdapter } from './helpers/numeric.js';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';

for (const Parser of [NearleyParser, RegexParser])
{
	const quantity = numeric => createQuantityClass({ numeric, parser: config => new Parser(config) });
	describe(`numerical guarantees (${Parser.name})`, () => {
		it('compares compatible values symmetrically without conversion rounding', () => {
			const Q = quantity(decimalAdapter.withConfig({ precision: 6 }));
			for (const [left, right] of [['1 m', '100.0001 cm'], ['-100.0001 cm', '-1 m'],
				['0 tempC', '273.1501 degK'], ['1 tempK', '1.800001 tempR']]) {
				const a = new Q(left), b = new Q(right);
				expect(a.compareTo(b)).toBe(-1);
				expect(b.compareTo(a)).toBe(1);
				expect(a.eq(b)).toBe(false);
				expect(b.eq(a)).toBe(false);
			}
		});
		it('applies exponent limits to the final conversion result', () => {
			const Q = quantity(decimalAdapter.withConfig({ maxE: 20, minE: -20 }));
			expect(new Q('1e-20 km10').to('m10').scalar.eq('1e10')).toBe(true);
			expect(new Q('1e20 m10').to('km10').scalar.eq('1e-10')).toBe(true);
			expect(new Q('1e20/km10').to('m10').scalar.eq('1e10')).toBe(true);
			expect(new Q('1e-20 m10').to('km10').scalar.eq(0)).toBe(true);
			expect(new Q('1e20 km10').to('m10').scalar.isFinite()).toBe(false);
			expect(new Q('1e20 tempR').to('tempK').scalar.toString()).toBe('55555555555555555556');
			expect(new Q('1e20 tempR').baseScalar.toString()).toBe('55555555555555555556');
		});
		for (const numeric of [numberAdapter, floatAdapter]) {
			it(`preserves zero across overflowing factors (${numeric.id})`, () => {
				const Q = quantity(numeric);
				expect(new Q('0 km200').to('m200').scalar).toBe(0);
				expect(new Q('-0 km200').to('m200').scalar).toBe(-0);
				expect(new Q('1e-20 km10').to('m10').scalar).toBeCloseTo(1e10, -4);
			});
		}
		it('validates cooling before rounding the available temperature interval', () => {
			const Down = quantity(decimalAdapter.withConfig({ precision: 2, rounding: 'down' }));
			const Up = quantity(decimalAdapter.withConfig({ precision: 2, rounding: 'up' }));
			expect(new Down('-271.916 tempC').sub('1.21 degC').scalar.toString()).toBe('-270');
			expect(() => new Up('-271.916 tempC').sub('1.235 degC')).toThrow('absolute zero');
			expect(() => new Up('-271.916 tempC').add('-1235 mdegC')).toThrow('absolute zero');
			expect(new Up('-271.916 tempC').sub('1234 mdegC').scalar.toString()).toBe('-273.15');
		});

		for (const rounding of ['up', 'down', 'ceil', 'floor', 'half-up', 'half-down', 'half-even', 'half-ceil', 'half-floor'])
		{
			it(`validates scalar temperature arithmetic before ${rounding} rounding`, () => {
				const numeric = decimalAdapter.withConfig({ precision: 2, rounding });
				const Q = quantity(numeric);
				const zero = new Q('-273.15 tempC');
				for (const one of [1, new Q('1'), numeric.from(1)]) {
					expect(zero.mul(one).scalar.toString()).toBe('-273.15');
					expect(zero.div(one).scalar.toString()).toBe('-273.15');
				}
				expect(new Q('1').mul(zero).scalar.toString()).toBe('-273.15');
				expect(() => zero.mul(1.0001)).toThrow('absolute zero');
				expect(() => zero.div(0.9999)).toThrow('absolute zero');
				expect(new Q('-273.14 tempC').mul(1).scalar.gte('-273.15')).toBe(true);
			});
		}
	});
}
