import { describe, expect, it } from 'vitest';
import { parseExpression } from '../helpers/nearley.js';
import { NearleyQtyParser } from '../../dist/parsers/NearleyQtyParser.js';
import { Quantity } from '../../dist/Quantity.js';
import { Quantity as RegexQuantity } from '../../dist/regex.js';

const parser = new NearleyQtyParser();

describe('Nearley reciprocal quantities and bare groups', () => {
	it.each([
		['2/s', '2', '1/s'],
		['1e3/s', '1000', '1/s'],
		['1.5/s', '1.5', '1/s'],
		['-.5/s', '-0.5', '1/s'],
		['+1/s', '1', '1/s'],
		['0/s', '0', '1/s'],
		['1.0/s', '1', '1/s'],
		['1/s', '1', '1/s'],
		['1^2/s', '1', '1/s'],
		['2^3/s', '8', '1/s'],
		['2 1/s', '2', '1/s'],
		['123456789012345678901e-3/s', '123456789012345678.901', '1/s'],
		['2/s*kg', '2', 'kg/s'],
		['2/s kg', '2', 'kg/s'],
		['2/s.kg', '2', '1/s.kg'],
		['2/s/kg', '2', '1/s.kg'],
		['2/s^-2.kg', '2', 's2/kg'],
		['2/s^0', '2', ''],
		['2/s^1000000', '2', '1/s1000000'],
		['(m/s)', '1', 'm/s'],
		['m/(s*kg)', '1', 'm/s.kg'],
		['(m)/(s)', '1', 'm/s'],
		['((m/s))', '1', 'm/s'],
		['(m/s)^2', '1', 'm2/s2'],
		['(m/s)2', '1', 'm2/s2'],
		['(m/s)^-2', '1', 's2/m2'],
		['(m/s)^0', '1', ''],
		['(1/s)', '1', '1/s'],
		['m/(1/s)', '1', 'm*s'],
		['1/(1/s)', '1', 's'],
		['2/(m/s)', '2', 's/m'],
		['2/(m.s)', '2', '1/m.s'],
		['2/(m/s).kg', '2', 's/m.kg'],
		['2/(m/s)*kg', '2', 's*kg/m'],
		['kg/(m/s.kg)', '1', 'kg2*s/m'],
		['2 (1/s)*kg', '2', 'kg/s'],
		[' \t1e3 / ( m * s ) \n', '1000', '1/m.s'],
		['ton(l)/(m*s)', '1', 'tnl/m.s'],
	])('parses %s once, with scalar %s and units %s', (input, scalar, units) => {
		parseExpression(input);
		const actual = new Quantity(parser.parse(input));
		expect(actual.scalar.toString()).toBe(scalar);
		const expected = new Quantity(`${scalar} ${units}`);
		expect(actual.numerator).toEqual(expected.numerator);
		expect(actual.denominator).toEqual(expected.denominator);
		expect(actual.baseScalar.eq(expected.baseScalar)).toBe(true);
		expect(new RegexQuantity(`${scalar} ${actual.units()}`).same(actual)).toBe(true);
	});

	it('preserves reciprocal scaling and parser selection in operations', () => {
		const quantity = new Quantity('2/(cm*hour)');
		expect(quantity.to('1/m/s').eq(new Quantity('2').div('cm').div('hour').to('1/m/s'))).toBe(true);
		expect(quantity.add('3/(cm*hour)').scalar.toString()).toBe('5');
		expect(quantity.clone().to('(hour*cm)^-1').eq(quantity)).toBe(true);
	});

	it.each(['2/', '2//s', '2/ /s', '2/*s', '2/.s', '()', '( )', '(m', 'm)', 'm/()', '(m/)', '(m//s)', '2/(m*s', '2/(m*s))', '(unknown)^0', '(m/s)^', '(m/s)^0.5', '(m/s)^9007199254740992'])
		('rejects malformed expression %j and recovers', input => {
			expect(() => parser.parse(input)).toThrow();
			expect(new Quantity(parser.parse('2/(m*s)')).units()).toBe('1/m.s');
		});
});
