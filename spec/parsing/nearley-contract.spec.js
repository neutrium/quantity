import { describe, expect, it, vi } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import Nearley from 'nearley';
import { parseExpression } from '../helpers/nearley.js';
import { NearleyQtyParser } from '../../dist/parsers/NearleyQtyParser.js';
import { RegexQtyParser } from '../../dist/parsers/RegexQtyParser.js';
import { UnitTokenManager } from '../../dist/UnitTokenManager.js';

describe('Nearley expression contract', () => {
	it.each([
		['(4)^0.5', '2'], ['((16)^.5)^.5', '2'], ['(2*8)**.5', '4'],
		['(4)^- .5', '0.5'], ['(2)^1e1', '1024'],
		['-(m/s)', '-1'], ['+(m/s)', '1'], ['- (2 m/s)', '-2'],
		['-(2)^2', '-4'], ['(-2)^2', '4'], ['-(-(2))', '2'],
		['2 * -3 m', '-6'], ['m / -2', '-0.5'], ['m (-2)', '-2'],
		['2*-(m/s)', '-2'], ['2/-(m/s)', '-2'], ['2·-3 m', '-6'],
		['- \n2 m', '-2'], ['+ \t.5e2m', '50'], ['/s', '1'], ['/(1/s)', '1'],
	])('accepts %j without ambiguity on misses and hits', (input, scalar) => {
		parseExpression(input);
		for (const maxEntries of [0, 16]) {
			const parser = new NearleyQtyParser({ cache: { maxEntries } });
			for (let repeat = 0; repeat < 2; repeat++) expect(parser.parse(input).scalar.toString()).toBe(scalar);
		}
	});

	it.each(['2 -3 m', '2 +3 m', '2 - 3 m', '2 + 3 m', 'm -2', 'm + 2',
		'2 -(m)', '2-(m)', '2 +(m)', '2 /s -3', '(2 -3)m'])
		('rejects ambiguous signed multiplication %j', input => {
			const parser = new NearleyQtyParser();
			// Related cached expressions must not weaken validation.
			parser.parse('2 3 m');
			parser.parse('2 * -3 m');
			const result = parser.tryParse(input);
			expect(result.success).toBe(false);
			expect(result.error.code).toBe('UNEXPECTED_TOKEN');
			expect(result.error.message).toContain('explicit multiplication');
		});

	it.each(['m^.5', '(m)^.5', '(m/m)^.5', '(m^0)^.5', '(2 m)^2.0', '(m)^1e3', '(m)^9007199254740992'])
		('keeps safe-integer syntax for expressions containing units: %j', input => {
			expect(new NearleyQtyParser().tryParse(input).success).toBe(false);
		});

	it('unary negation preserves exact digits and signed zero', () => {
		const Numeric = Decimal.clone({ precision: 5 });
		const parser = new NearleyQtyParser();
		const input = '-(123456789012345678901 m)';
		expect(parser.parse(input, Numeric).scalar.toString()).toBe('-123456789012345678901');
		expect(parser.parse('-(0 m)', Numeric).scalar.isNeg()).toBe(true);
		expect(parser.parse('-(-0 m)', Numeric).scalar.isNeg()).toBe(false);
	});

	it('keeps errors at the original signed factor after a changed leading scalar', () => {
		const parser = new NearleyQtyParser();
		for (const input of ['2 -3 m', ' 1234 -3 m', '- \n2 -3 m']) {
			const result = parser.tryParse(input);
			expect(result.error.offset).toBe(input.lastIndexOf('-3'));
		}
	});
});

describe('Regex syntax is a subset of Nearley syntax', () => {
	const regex = new RegexQtyParser();
	const nearley = new NearleyQtyParser();
	function compare(input) {
		const expected = regex.parse(input);
		for (let repeat = 0; repeat < 2; repeat++) {
			const actual = nearley.parse(input);
			expect(actual.scalar.toString(), input).toBe(expected.scalar.toString());
			expect(actual.scalar.isNeg(), input).toBe(expected.scalar.isNeg());
			expect(actual.numerator, input).toEqual(expected.numerator);
			expect(actual.denominator, input).toEqual(expected.denominator);
		}
	}

	it('accepts signed scalars, sign whitespace, reciprocals, powers and mixed operators', () => {
		for (const scalar of ['', '2 ', '- 2 ', '+\t.5e2 ', '-\n0 ', '1e-3']) {
			for (const units of ['m', '/s', '/ m.s^2', 'kg*m/s**-2', 'm-2', 'kg/m.s*ampere', 'minch/s', 'm\ts'])
				compare(scalar + units);
		}
	});

	it('covers every catalogue alias accepted by Regex, including prefixed spellings', () => {
		let checked = 0;
		for (const alias of Object.keys(UnitTokenManager.instance.getMap('unit'))) {
			for (const input of [alias, `- \t2 ${alias}**2`, `/ ${alias}`, `1 m${alias}/s`]) {
				try { regex.parse(input); } catch { continue; }
				compare(input);
				checked++;
			}
		}
		expect(checked).toBeGreaterThan(500);
	});
});

describe('Nearley diagnostic adapter', () => {
	it.each(['m^', 'm**', 'm ^ \n'])('requests an integer exponent at the end of %j', input => {
		const result = new NearleyQtyParser().tryParse(input);
		expect(result.error.code).toBe('UNEXPECTED_END');
		expect(result.error.offset).toBe(input.length);
		expect(result.error.expected).toEqual(['integer']);
		expect(result.error.message).toContain('Expected an exponent');
	});

	it('allows numeric exponent hints for scalar groups and keeps closing-parenthesis hints', () => {
		const parser = new NearleyQtyParser();
		expect(parser.tryParse('(4)^').error.expected).toEqual(['integer', 'signedFloat']);
		expect(parser.tryParse('(m').error.expected).toEqual([')']);
	});

	it('does not depend on Nearley English error wording', () => {
		const wording = vi.spyOn(Nearley.Parser.prototype, 'reportError').mockReturnValue('Different wording');
		try {
			const result = new NearleyQtyParser().tryParse('m^2.0');
			expect(result.error.expected).toEqual(['integer']);
			expect(result.error.offset).toBe(2);
		} finally { wording.mockRestore(); }
	});
});
