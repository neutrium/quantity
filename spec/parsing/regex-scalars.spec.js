import { expect, it } from 'vitest';
import { RegexQtyParser } from '../../dist/parsers/RegexQtyParser.js';

const parser = new RegexQtyParser();

it.each([
	['- 2', '-2'], ['+\t.5', '0.5'], ['-\n1.25E-3', '-0.00125'],
	['+\u00a01e+3', '1000'], ['.5e2', '50'], ['0', '0'],
	['-0', '0'], ['- \t0', '0'],
	['123456789012345678901', '123456789012345678901'],
])('preserves scalar syntax and precision for %j', (input, expected) => {
	for (const suffix of ['', 'm', ' m/s', '/s']) {
		const result = parser.parse(` \t${input}${suffix}\n `);
		expect(result.scalar.toString()).toBe(expected);
		expect(result.scalar.isNeg()).toBe(input.startsWith('-'));
		const units = parser.parse(suffix || '1');
		expect(result.numerator).toEqual(units.numerator);
		expect(result.denominator).toEqual(units.denominator);
	}
});

it('preserves default scalars and adjacent aliases beginning with e or E', () => {
	expect(parser.parse('kg*m/s2').scalar.toString()).toBe('1');
	expect(parser.parse('1eV').numerator).toEqual([{ unit: '<electron-volts>', exponent: 1 }]);
	expect(parser.parse('2Em').numerator).toEqual([{ unit: '<meter>', prefix: '<exa>', exponent: 1 }]);
	expect(parser.parse('2Em').scalar.toString()).toBe('2');
});

it.each(['', ' \t', '+', '- m', '++1 m', '+-1 m', '1e+ m', '1e- 3 m', '1 2 m', '1.', '. m'])
	('continues to reject malformed scalars in %j', input => {
		expect(() => parser.parse(input)).toThrow();
	});
