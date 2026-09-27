import { describe, expect, it } from 'vitest';
import { parseExpression } from '../helpers/nearley.js';
import { NearleyQtyParser } from '../../dist/parsers/NearleyQtyParser.js';
import { Quantity } from '../../dist/Quantity.js';
import { MooQtyLexer } from '../../dist/parsers/MooQtyLexer.js';

const parser = new NearleyQtyParser();

describe('Nearley alternative power syntax', () => {
	it.each([
		'm**2', 'km**-2', 'm ** +2', 'm**0',
		'3.5 kg*m/s**2', 'kg/m.s**2',
		'2 (m/s)**2', '2 ((kg*m)**2/s)**-2',
		'2**3 m', '2e1 ** 2e0 m',
	])('parses %s identically to caret powers without ambiguity', input => {
		const expected = parser.parse(input.replaceAll('**', '^'));
		expect(parser.parse(input)).toEqual(expected);
		parseExpression(input);
	});

	it.each(['m**', 'm***2', 'm * * 2', 'm**2.0', 'm**1e3', 'm**9007199254740992'])
		('rejects invalid power %j', input => {
			expect(() => parser.parse(input)).toThrow();
		});
});

describe('Nearley scientific notation', () => {
	it.each([
		['1e3', '1000'], ['1E3', '1000'], ['+1e+3', '1000'],
		['-2E-3', '-0.002'], ['0e3', '0'], ['.5e2', '50'],
		['-.5E-2', '-0.005'], ['1.25e3', '1250'],
		['+2', '2'], ['+1.25', '1.25'], ['.5', '0.5'],
		['123456789012345678901e-3', '123456789012345678.901'],
	])('parses %s without rounding through a JavaScript number', (input, scalar) => {
		const definition = parser.parse(input);
		expect(definition.scalar.toString()).toBe(scalar);
		expect(definition.numerator).toEqual([]);
		for (const separator of ['', ' ', '\t']) {
			const quantity = new Quantity(input + separator + 'm');
			expect(quantity.scalar.toString()).toBe(scalar);
			expect(quantity.units()).toBe('m');
		}
	});

	it('supports scientific notation in scalar powers', () => {
		expect(new Quantity('2e1 ^ 2e0 m').scalar.toString()).toBe('400');
	});

	it('preserves units whose aliases begin with e or E', () => {
		expect(new Quantity('1eV').numerator).toEqual([{ unit: '<electron-volts>', exponent: 1 }]);
		expect(new Quantity('1Em').numerator).toEqual([{ unit: '<meter>', prefix: '<exa>', exponent: 1 }]);
	});
});

describe('Nearley whitespace', () => {
	it.each([' ', '   ', '\t', '\n', '\r\n', '\u00a0', ' \t\n '])(
		'accepts whitespace %j at expression boundaries and unit separators', whitespace => {
			const quantity = new Quantity(`${whitespace}2${whitespace}kg${whitespace}m${whitespace}/${whitespace}s${whitespace}^${whitespace}2${whitespace}`);
			expect(quantity.scalar.toString()).toBe('2');
			expect(quantity.units()).toBe('kg*m/s2');
			expect(new Quantity(`${whitespace}2${whitespace}`).scalar.toString()).toBe('2');
			expect(new Quantity(`${whitespace}m${whitespace}`).units()).toBe('m');
		}
	);

	it('accepts whitespace inside powered groups and around explicit multiplication', () => {
		const quantity = new Quantity(' \t2e3 ( kg * m / s ) ^ -2 \n');
		expect(quantity.scalar.toString()).toBe('2000');
		expect(quantity.units()).toBe('s2/kg2.m2');
		expect(new Quantity('m \t.\n s').units()).toBe('m*s');
	});

	it('tracks token locations across whitespace containing newlines', () => {
		const tokens = new MooQtyLexer().tokenize('m\r\n  s');
		expect(tokens.map(token => token.type)).toEqual(['unit', 'ws', 'unit']);
		expect(tokens[2]).toMatchObject({ line: 2, col: 3, value: 's' });
	});
});

it.each(['1e', '1e+', '1E-', '1e2e3 m', 'm^1e3', 'm1e3', 'm^2.0', 'm^9007199254740992', '', ' \t\n ', 'm / ', 'm ^ '])
	('rejects malformed or unsupported input %j and recovers on the next call', input => {
		expect(() => parser.parse(input)).toThrow();
		expect(parser.parse('1e3 m').scalar.toString()).toBe('1000');
	});

it.each(['1e3 m', ' 2 ', ' m ', ' m  s ', '1 / m / s', '2 ^ 3 m', ' ( m / s ) ^ 2 ', 'kg', '2 kg * m / s ^ 2', 'kg/m.s', 'kg / m . s * ampere', 'kg/m s.ampere'])
	('produces one complete parse for %j', input => {
		parseExpression(input);
	});
