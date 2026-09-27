import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { NearleyQtyParser, QuantityParseError } from '../../dist/parsers/NearleyQtyParser.js';
import { Quantity } from '../../dist/Quantity.js';

const parser = new NearleyQtyParser();

describe('Nearley scalar arithmetic and typography', () => {
	it.each([
		['1/2', '0.5', ''], ['m/2', '0.5', 'm'], ['3/2 m', '1.5', 'm'],
		['8 m/2', '4', 'm'], ['m/2 s', '0.5', 'm*s'], ['m/(2 s)', '0.5', 'm/s'],
		['1/2m', '0.5', '1/m'], ['2*3 m', '6', 'm'], ['2 3 m', '6', 'm'],
		['2m*3s', '6', 'm*s'], ['m/-2', '-0.5', 'm'], ['m/.5', '2', 'm'],
		['2/(3/4)', '2.6666666666666666667', ''], ['(2 m/s)**2', '4', 'm2/s2'],
		['(2 m/s)^-2', '0.25', 's2/m2'], ['(2 m/4 s)**2', '0.25', 'm2*s2'],
		['0 m/2', '0', 'm'], ['0/2 m', '0', 'm'], ['m/(2**3 s)', '0.125', 'm/s'],
		['2³ m', '8', 'm'], ['m²', '1', 'm2'], ['m⁻²', '1', '1/m2'],
		['m⁺¹²', '1', 'm12'], ['(m/s)²', '1', 'm2/s2'], ['kg/m·s²', '1', 'kg/m.s2'],
		['kg/m⋅s²', '1', 'kg/m.s2'], ['kg/m×s²', '1', 'kg*s2/m'],
		['(2m/s)⁻²', '0.25', 's2/m2'], ['1eV/2', '0.5', 'eV'],
	])('evaluates %s on cache misses and hits', (input, scalar, units) => {
		for (let repeat = 0; repeat < 2; repeat++) {
			const value = new Quantity(parser.parse(input));
			expect(value.scalar.toString()).toBe(scalar);
			expect(value.units()).toBe(units);
		}
	});

	it('preserves left-to-right rounding and evaluates cached programs under current precision', () => {
		for (const precision of [5, 30, 8]) {
			Decimal.config = { precision };
			for (const scalar of ['1', '2', '0', '123456789012345678901']) {
				const actual = parser.parse(`${scalar}/3*7 m`);
				const expected = new Decimal(scalar).div(3).mul(7);
				expect(actual.scalar.toString()).toBe(expected.toString());
			}
			expect(parser.parse('m/3*7').scalar.toString()).toBe(new Decimal(1).div(3).mul(7).toString());
			expect(parser.parse('2**.5 m').scalar.toString()).toBe(new Decimal(2).pow('.5').toString());
		}
	});

	it('preserves high precision literals when multiplying by identity factors', () => {
		Decimal.config = { precision: 5 };
		const digits = '123456789012345678901';
		expect(parser.parse(`${digits} 1/s`).scalar.toString()).toBe(digits);
		expect(parser.parse(`1*${digits} m`).scalar.toString()).toBe(digits);
		expect(parser.parse(`${digits}/1 m`).scalar.toString()).toBe(digits);
	});

	it('does not cache a failure as a successful expression', () => {
		expect(parser.tryParse('0**-1/0 m').success).toBe(false);
		expect(parser.parse('2**-1/2 m').scalar.toString()).toBe('0.25');
	});

	it.each(['m/0', '0/0', '2/(0*s)', 'm/(2/0)', '0*(m/0)'])('rejects division by zero in %s', input => {
		const result = parser.tryParse(input);
		expect(result.success).toBe(false);
		expect(result.error).toBeInstanceOf(QuantityParseError);
		expect(result.error.code).toBe('DIVISION_BY_ZERO');
	});
});

describe('structured parser diagnostics', () => {
	it.each([
		['kg/(m*s', 'UNEXPECTED_END', 7, 1, 8],
		['m\n / unknown', 'UNKNOWN_UNIT', 5, 2, 4],
		['  123 m/0', 'DIVISION_BY_ZERO', 7, 1, 8],
		['m^2.0', 'UNEXPECTED_TOKEN', 2, 1, 3],
		['m⁻² / nope', 'UNKNOWN_UNIT', 6, 1, 7],
		['m^9007199254740992', 'INVALID_EXPONENT', 2, 1, 3],
	])('locates %j in the original input', (input, code, offset, line, column) => {
		const result = parser.tryParse(input);
		expect(result.success).toBe(false);
		expect(result.error).toMatchObject({ code, input, offset, line, column });
		expect(result.error.message).toContain('^');
		expect(() => parser.parse(input)).toThrow(QuantityParseError);
	});

	it('provides expected tokens and narrows success results', () => {
		expect(parser.tryParse('(m').error.expected).toEqual([')']);
		expect(parser.tryParse('m^2.0').error.expected).toContain('integer');
		const result = parser.tryParse('m/2');
		expect(result.success).toBe(true);
		expect(result.value.scalar.toString()).toBe('0.5');
		expect(parser.tryParse(null).error.code).toBe('INVALID_INPUT');
	});

	it('relocates cached evaluation errors after a longer leading scalar', () => {
		Decimal.config = { minE: -100 };
		parser.parse('2/1e-30 m');
		Decimal.config = { minE: -10 };
		const failure = parser.tryParse('  1234/1e-30 m');
		expect(failure.error.code).toBe('DIVISION_BY_ZERO');
		expect(failure.error.offset).toBe(6);
	});
});
