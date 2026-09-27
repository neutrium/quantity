import { describe, expect, it } from 'vitest';
import { Quantity } from '../../dist/Quantity.js';
import { Quantity as RegexQuantity } from '../../dist/regex.js';
import { NearleyQtyParser } from '../../dist/parsers/NearleyQtyParser.js';
import { RegexQtyParser } from '../../dist/parsers/RegexQtyParser.js';

describe('shared multiplication and division precedence', () => {
	it.each([
		['m/s*kg', 'm*kg/s'],
		['m/s.kg', 'm/s.kg'],
		['kg/m.s', 'kg/m.s'],
		['kg/m*s', 'kg*s/m'],
		['kg/m s', 'kg*s/m'],
		['kg / m \t.\n s', 'kg/m.s'],
		['kg/m.s.ampere', 'kg/m.s.A'],
		['kg/m.s*ampere', 'kg*A/m.s'],
		['kg/m*s.ampere', 'kg*s*A/m'],
		['kg/m.s ampere', 'kg*A/m.s'],
		['kg/m s.ampere', 'kg*s*A/m'],
		['kg.m/s.ampere', 'kg*m/s.A'],
		['kg/m.s/ampere.mole', 'kg/m.s.A.mol'],
		['kg/m^2.s^-3', 'kg*s3/m2'],
		['kg/m^-2.s^-3', 'kg*m2*s3'],
		['kg/m^0.s', 'kg/s'],
		['kg/m.s^0', 'kg/m'],
		['kg/m1000000.s1000000', 'kg/m1000000.s1000000'],
		['1/m.s', '1/m.s'],
		['1/m.s*kg', 'kg/m.s'],
		['m/s kg', 'm*kg/s'],
		['m / s \t*\n kg', 'm*kg/s'],
		['m/s/kg', 'm/s.kg'],
		['m*s/kg', 'm*s/kg'],
		['m/s/kg*ampere', 'm*A/s.kg'],
		['m/s*kg/ampere', 'm*kg/s.A'],
		['1/m*s', 's/m'],
		['1/m/s*kg', 'kg/m.s'],
		['m/s^2*kg^3', 'm*kg3/s2'],
		['m/s^-2*kg^-3', 'm*s2/kg3'],
		['m/s^-2/kg^-3', 'm*s2*kg3'],
		['m/s^0*kg', 'm*kg'],
		['m/s^1000000*kg', 'm*kg/s1000000'],
		['m/s*ton(l)', 'm*tnl/s'],
	])('parses %s as %s, including cached parses', (input, units) => {
		const expected = new Quantity(units);
		for (const Constructor of [Quantity, RegexQuantity]) {
			for (let repeat = 0; repeat < 2; repeat++) {
				const actual = new Constructor(input);
				expect(actual.units()).toBe(units);
				expect(actual.numerator).toEqual(expected.numerator);
				expect(actual.denominator).toEqual(expected.denominator);
				expect(actual.eq(expected)).toBe(true);
				expect(new Constructor(actual.units()).same(actual)).toBe(true);
			}
		}
	});

	it('agrees with sequential arithmetic for scaled units and negative powers', () => {
		const expected = new Quantity('2 km').div('hour^-2').mul('g^-3').div('ampere');
		for (const Constructor of [Quantity, RegexQuantity]) {
			const actual = new Constructor('2 km/hour^-2*g^-3/ampere');
			expect(actual.same(expected)).toBe(true);
			expect(actual.toBase().scalar.eq(expected.baseScalar)).toBe(true);
		}
	});

	it('divides by a whole dot product, including its scale factors', () => {
		const expected = new Quantity('2 kg').div(new Quantity('cm^2').mul('hour^-3'));
		for (const Constructor of [Quantity, RegexQuantity]) {
			const actual = new Constructor('2 kg/cm^2.hour^-3');
			expect(actual.same(expected)).toBe(true);
			expect(actual.baseScalar.eq(expected.baseScalar)).toBe(true);
		}
	});

	it('respects explicit powered groups in Nearley', () => {
		expect(new Quantity('kg/m.s').eq('kg/(m*s)^1')).toBe(true);
		expect(new Quantity('kg/(m.s)^-2').same(new Quantity('kg*m2*s2'))).toBe(true);
		expect(new Quantity('kg/(m/s)^1.ampere').same(new Quantity('kg*s/m/ampere'))).toBe(true);
	});

	it('keeps differently ordered operators separate in the regex cache', () => {
		const parser = new RegexQtyParser();
		for (const input of ['m/s*kg', 'm/s.kg', 'm/s/kg', 'm*s/kg', 'm/s*kg', 'm/s.kg']) {
			const actual = new RegexQuantity(parser.parse(input));
			expect(actual.same(new Quantity(input))).toBe(true);
		}
	});

	it('preserves regex scalar reciprocals and ** power syntax', () => {
		const actual = new RegexQuantity('2/m**2*s**-3');
		expect(actual.scalar.toString()).toBe('2');
		expect(actual.units()).toBe('1/m2.s3');
		expect(new RegexQuantity('2/m*s').same(new Quantity('2 s/m'))).toBe(true);
		expect(new RegexQuantity('2/m**2.s**-3').same(new Quantity('2 s3/m2'))).toBe(true);
	});

	it('rejects missing operands and adjacent operators', () => {
		for (const Parser of [NearleyQtyParser, RegexQtyParser]) {
			const parser = new Parser();
			for (const input of ['m/', 'm/s*', 'm/*s', 'm*/s', 'm//s', 'm/ /s', 'm/s/.kg', 'm/s*/kg', 'm/s^0/', 'kg/m.', 'kg/m..s', 'kg/m.*s', 'kg/m./s']) {
				expect(() => parser.parse(input), input).toThrow();
			}
			expect(new Quantity(parser.parse('m/s*kg')).units()).toBe('m*kg/s');
		}
	});
});
