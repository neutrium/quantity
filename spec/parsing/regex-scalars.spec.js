import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
import { expect, it } from 'vitest';
import { RegexParser } from '../../dist/parsers/RegexParser.js';
import { Quantity } from '../../dist/regex.js';

const testNumeric = new DecimalScientificAdapter();
const parser = new RegexParser();

it.each([
	['- 2', '-2'], ['+\t.5', '0.5'], ['-\n1.25E-3', '-0.00125'],
	['+\u00a01e+3', '1000'], ['.5e2', '50'], ['0', '0'],
	['-0', '0'], ['- \t0', '0'],
	['123456789012345678901', '123456789012345678901'],
])('preserves scalar syntax and precision for %j', (input, expected) => {
	for (const suffix of ['', 'm', ' m/s', '/s']) {
		const result = parser.parse(` \t${input}${suffix}\n `, testNumeric);
		expect(result.scalar.toString()).toBe(expected);
		expect(result.scalar.isNeg()).toBe(input.startsWith('-'));
		const units = parser.parse(suffix || '1', testNumeric);
		expect(result.numerator).toEqual(units.numerator);
		expect(result.denominator).toEqual(units.denominator);
	}
});

it('preserves default scalars and adjacent aliases beginning with e or E', () => {
	expect(parser.parse('kg*m/s2', testNumeric).scalar.toString()).toBe('1');
	expect(parser.parse('1eV', testNumeric).numerator).toEqual([{ unit: '<electron-volts>', exponent: 1 }]);
	expect(parser.parse('2Em', testNumeric).numerator).toEqual([{ unit: '<meter>', prefix: '<exa>', exponent: 1 }]);
	expect(parser.parse('2Em', testNumeric).scalar.toString()).toBe('2');
});

it.each(['', ' \t', '+', '- m', '++1 m', '+-1 m', '1e+ m', '1e- 3 m', '1 2 m', '1.', '. m'])
	('continues to reject malformed scalars in %j', input => {
		expect(() => parser.parse(input, testNumeric)).toThrow();
	});

it('rejects numeric factors that resemble unity with a compact exponent', () => {
	for (const input of ['1/10 m', '10 m/12', '3 m*10', 'm 100', 'm/1-2']) {
		expect(() => parser.parse(input, testNumeric)).toThrow();
	}
	for (const [input, equivalent] of [['1/m', '/m'], ['m2/1', 'm^2'], ['m^0', '1']]) {
		expect(parser.parse(input, testNumeric)).toEqual(parser.parse(equivalent, testNumeric));
	}
});

it('distinguishes a decimal factor from a dot followed by the unity unit', () => {
	for (const expression of ['3 m .1', '3 m\t.1/s', '3 m .1^2']) {
		expect(() => new Quantity(expression)).toThrow('Scalar arithmetic requires Nearley or Pratt');
	}
	expect(new Quantity('3 m . 1').same(new Quantity('3 m'))).toBe(true);
});

it.each([true, false])('preserves invalid temperature prefixes through zero powers, cache=%s', cache => {
	const Q = Quantity.withConfig({ cache });
	for (const input of ['ktempC^0', '1/ktempC^0', 'm*ktempK0']) {
		const definition = parser.parse(input, testNumeric);
		expect(() => new Q(definition)).toThrow(/temperature/i);
		expect(() => new Q(input)).toThrow(/temperature/i);
		expect(() => new Q(1, input)).toThrow(/temperature/i);
	}
	expect(new Q('tempC^0').units()).toBe('');
	expect(new Q('kdegC^0').units()).toBe('');
});

it('rejects inverting an absolute temperature whose own exponent is negative', () => {
	expect(() => new Quantity('1/tempC^-1')).toThrow(/temperature/i);
});
