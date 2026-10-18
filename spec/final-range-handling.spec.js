import { overrideAdapter } from './helpers/numeric.js';
import { describe, expect, it } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { DecimalArithmeticAdapter } from '@neutrium/utilities/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
import { NumberAdapter } from '@neutrium/utilities/number';
const numberAdapter = new NumberAdapter();
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';

for (const Parser of [NearleyParser, RegexParser])
{
	const configure = numeric => createQuantityClass({ numeric, parser: c => new Parser(c) });

	describe(`final range handling (${Parser.name})`, () => {
		for (const config of [{ maxE: 20, minE: -100 }, { maxE: 100, minE: -20 }, { maxE: 20, minE: -20 }])
		{
			it(`matches scientific powers with range ${config.minE}..${config.maxE}`, () => {
				const A = configure(new DecimalArithmeticAdapter(config)), S = configure(new DecimalScientificAdapter(config));
				for (const base of ['1e10', '-1e10', '1e-10', '-1e-10'])
				{
					for (const exponent of [-4, -3, 3, 4])
					{
						const actual = new A(base, 'm').pow(exponent);
						const expected = new S(base, 'm').pow(exponent);
						expect(actual.scalar.eq(expected.scalar)).toBe(true);
						expect(actual.scalar.isNeg()).toBe(expected.scalar.isNeg());
						expect(actual.units()).toBe(expected.units());
					}
				}
			});
		}

		for (const rounding of ['up', 'down', 'ceil', 'floor', 'half-up', 'half-down', 'half-even', 'half-ceil', 'half-floor'])
		{
			it(`rounds integer powers only once (${rounding})`, () => {
				const config = { precision: 6, rounding };
				const A = configure(new DecimalArithmeticAdapter(config)), S = configure(new DecimalScientificAdapter(config));

				for (const exponent of [-7, 7])
				{
					for (const value of ['1.23456789', '-1.23456789'])
					{
						expect(new A(value, 'm').pow(exponent).scalar.eq(new S(value, 'm').pow(exponent).scalar)).toBe(true);
					}
				}
			});
		}

		for (const Adapter of [DecimalArithmeticAdapter, DecimalScientificAdapter])
		{
			it(`keeps temperature offsets outside the ${new Adapter().tier} output range`, () => {
				const Q = configure(new Adapter({ maxE: 1, minE: -20 }));
				expect(new Q('1 tempC').to('tempF').scalar.eq('33.8')).toBe(true);
				expect(new Q('33.8 tempF').to('tempC').scalar.eq(1)).toBe(true);
				expect(new Q('1 tempC').eq('33.8 tempF')).toBe(true);
				expect(new Q('1 tempC').sub('32 tempF').scalar.eq(1)).toBe(true);
				expect(new Q('1 tempC').mul(1).scalar.eq(1)).toBe(true);
				expect(new Q('1 tempC').add('1 degC').scalar.eq(2)).toBe(true);
				expect(() => new Q('-4 tempC').mul(99)).toThrow('absolute zero');
				expect(new Q('1 tempC').to('tempK').scalar.toString()).toBe('Infinity');
				expect(() => new Q('1 tempK').to('tempC')).toThrow(RangeError);
				expect(() => new Q('0 tempK').to('tempC')).toThrow(RangeError);
				expect(new Q('1e-20 mdegK').to('tempK').scalar.isZero()).toBe(true);
				expect(() => new Q('-1e-20 mdegK').to('tempK')).toThrow('absolute zero');
			});
			it(`makes ${new Adapter().tier} calculations independent of display settings`, () => {
				const numeric = new Adapter({ toExpNeg: -2000000, toExpPos: 2000000, maxOutputDigits: 5 });
				const Q = configure(numeric);
				const tiny = new Q('1e-1000001 m'), large = new Q('1e1000001 m');
				expect(tiny.to('cm').scalar.eq('1e-999999')).toBe(true);
				expect(large.to('mm').scalar.eq('1e1000004')).toBe(true);
				expect(tiny.eq('1e-999999 cm')).toBe(true);
				expect(tiny.add('1e-999999 cm').scalar.eq('2e-1000001')).toBe(true);
				expect(tiny.pow(-1).scalar.eq('1e1000001')).toBe(true);
				expect(new Q('1 m').pow(numeric.from(123456)).scalar.eq(1)).toBe(true);
				expect(numeric.config.toExpNeg).toBe(-2000000);
				expect(numeric.config.maxOutputDigits).toBe(5);
				expect(() => numeric.toString(large.scalar)).toThrow('Output digit limit');
			});
		}
		it('preserves absolute temperatures raised to power one without rounding their boundary', () => {
			for (const rounding of ['up', 'floor', 'down', 'ceil', 'half-up']) {
				const Q = configure(new DecimalScientificAdapter({ precision: 2, rounding }));
				for (const value of ['-273.15 tempC', '-459.67 tempF', '0 tempK', '0 tempR', '-273.14 tempC']) {
					const source = new Q(value), result = source.pow(1);
					expect(result.same(source)).toBe(true);
					expect(result).toBeInstanceOf(Q);
				}
				expect(() => new Q('1 tempC').pow(2)).toThrow('temperatures');
			}
		});
	});
}

it('preserves arithmetic-tier zero, infinity and NaN power behavior', () => {
	const numeric = overrideAdapter(numberAdapter, { tier: 'arithmetic' });
	const Q = createQuantityClass({ numeric, parser: c => new RegexParser(c) });
	for (const value of [0, -0, Infinity, -Infinity, NaN]) {
		for (const exponent of [-3, -2, 0, 2, 3])
			expect(new Q(value).pow(exponent).scalar).toBe(value ** exponent);
	}
	expect(new Q(-1).pow(Number.MAX_SAFE_INTEGER).scalar).toBe(-1);
});

it('uses the range-safe arithmetic power path in Nearley scalar expressions', () => {
	const Q = createQuantityClass({ numeric: new DecimalArithmeticAdapter({ maxE: 20, minE: -100 }), parser: c => new NearleyParser(c) });
	expect(new Q('(1e10 m)^-3').scalar.eq('1e-30')).toBe(true);
	expect(new Q('1e10 m').pow(-1000000).scalar.isZero()).toBe(true);
});
