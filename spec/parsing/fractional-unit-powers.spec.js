import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { NumberAdapter } from '@neutrium/math/adapters/number';
const testNumeric = new DecimalScientificAdapter();
import { describe, expect, it } from 'vitest';
import { NearleyParser, PrattParser, RegexParser } from '@neutrium/quantity/parsers.js';

describe('unambiguous unit exponents', () => {
	it.each([NearleyParser, PrattParser])('$name evaluates equivalent scalar powers with the same real root', Parser => {
		const parser = new Parser();
		for (const numeric of [new NumberAdapter(), testNumeric, new DecimalArithmeticAdapter()]) {
			for (const exponent of ['0.2', '2e-1', '(1/5)']) {
				expect(numeric.toNumber(parser.parse(`(-32)^${exponent}`, numeric).scalar)).toBe(-2);
			}
			expect(numeric.toNumber(parser.parse('(-32)^-0.2', numeric).scalar)).toBe(-0.5);
			expect(() => parser.parse('(-4)^0.5', numeric)).toThrow('not real');
		}
	});

	it.each([NearleyParser, PrattParser])('$name distinguishes grouped compact powers and explicit prefixed unity', Parser => {
		const p = new Parser();
		expect(p.parse('(m1)²', testNumeric).numerator).toEqual(p.parse('m^2', testNumeric).numerator);
		expect(p.parse('m<1>²', testNumeric).numerator).toEqual(p.parse('m<1>^2', testNumeric).numerator);
	});

	it.each([NearleyParser, PrattParser])('$name retains scalar evaluation rules when units are parsed first', Parser => {
		const p = new Parser({}), basic = new DecimalArithmeticAdapter();
		const wide = '(-1)^9007199254740992';
		expect(p.parse(wide, basic, undefined, basic.from(7)).scalar.eq(7)).toBe(true);
		expect(p.parse(wide, testNumeric).scalar.eq(1)).toBe(true);
		expect(p.tryParse(wide, basic).error.code).toBe('INVALID_SCALAR');
		expect(p.parse('2^(1/0)', basic, undefined, basic.from(7)).scalar.eq(7)).toBe(true);
		expect(p.tryParse('2^(1/0)', basic).error.code).toBe('INVALID_SCALAR');
	});

	it.each([NearleyParser, PrattParser])('$name preserves absolute readings raised to exactly one', Parser => {
		const parser = new Parser({});
		for (const rounding of ['floor', 'down']) {
			const numeric = testNumeric.withConfig({ precision: 2, rounding });
			for (const [reading, unit] of [['-273.15', 'tempC'], ['-459.67', 'tempF'], ['1.2345', 'tempK']]) {
				expect(parser.parse(`(${reading} ${unit})^(2/2)`, numeric).scalar.toString()).toBe(reading);
			}
			// Interval and ordinary powers still use the adapter's final rounding.
			expect(parser.parse('(1.2345 degC)^1', numeric).scalar.toString()).toBe('1.2');
		}
	});

	it.each([NearleyParser, PrattParser])('$name evaluates a cached group power using the current adapter', Parser => {
		const parser = new Parser({});
		const input = '(2 m^2)^(1/2)';
		for (const [precision, expected] of [[4, '1.414'], [10, '1.414213562']]) {
			const result = parser.parse(input, testNumeric.withConfig({ precision }));
			expect(result.scalar.toString()).toBe(expected);
			expect(result.numerator).toEqual([{ unit: '<meter>', exponent: 1 }]);
		}
		expect(parser.cacheStats.entries).toBe(1);
	});

	it.each(['m2.1', 'm-2.1', 'm.1', 'm.1.s', 'm^(1/0)', 'm^(1.5/2)', 'm1^2', 'm1^(1/2)', 's/R1^-2', 'm1²', 'h1⁻²', 's/R1⁺²',
		'm1-2', 'm1+2', 's/R1-2'])('rejects %s with every parser', input => {

		for (const Parser of [NearleyParser, PrattParser, RegexParser])
		{
			const parser = new Parser();
			parser.parse('m2', testNumeric); // A related successful plan must not affect rejection.
			for (let repeat = 0; repeat < 2; repeat++)
			{
				expect(() => parser.parse(input, testNumeric)).toThrow();
			}
		}
	});

	it.each([NearleyParser, PrattParser, RegexParser])('$name accepts single compact powers and unambiguous prefixed unity', Parser => {
		const parser = new Parser();
		for (const [compact, explicit] of [['m12', 'm^12'], ['m-2', 'm^-2'], ['m<1>-2', 'm<1>^-2'], ['k1-2', 'k<1>^-2']])
		{
			expect(parser.parse(compact, testNumeric)).toEqual(parser.parse(explicit, testNumeric));
		}
	});

	it.each(['kg/m.s', 'kg/m.s^2', 'm^2.s', 'm**-2.s', 'm2.s', 'm^2*1', 'm^2. 1',
		'm^2 . 1', '1.25 m2/s', '.5 kg/m.s', 'm1', 'm^2', 'k1^2', 'm<1>^2'])('preserves unambiguous products and scalars: %s', input => {
		expect(new RegexParser().parse(input, testNumeric)).toEqual(new NearleyParser().parse(input, testNumeric));
	});
});
