import assert from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import { parseExpression } from '../helpers/nearley.js';
import { NearleyQtyParser } from '../../dist/parsers/NearleyQtyParser.js';
import { RegexQtyParser } from '../../dist/parsers/RegexQtyParser.js';
import { Quantity } from '../../dist/Quantity.js';
import { UnitTokenManager } from '../../dist/UnitTokenManager.js';

describe('complete unit tokenization', () => {
	it.each([
		['minch', '<inch>', '<milli>'],
		['minches', '<inch>', '<milli>'],
		['min', '<minute>', undefined],
		['kg', '<kilogram>', undefined],
		['dam', '<meter>', '<deca>'],
		['mmin', '<minute>', '<milli>'],
		['mPa', '<pascal>', '<milli>'],
		['mmHg', '<mmHg>', undefined],
		['cmH2O', '<cmh2o>', undefined],
		['mcmH2O', '<cmh2o>', '<milli>'],
		['kton(l)', '<ton-long>', '<kilo>'],
		['mgal(us fl)', '<gallon-us-liquid>', '<milli>'],
		['kilogram-force', '<gram-force>', '<kilo>'],
		['Gy', '<gray>', undefined],
		['Gy(j)', '<year-julian>', '<giga>'],
		['day', '<day>', undefined],
		['day(j)', '<year-julian>', '<deca>'],
		['Gigal(imp)', '<gallon-uk>', '<gibi>'],
		['nleague(us)', '<league>', '<nano>'],
	])('resolves %s without partial aliases or ambiguous parses', (input, unit, prefix) => {
		parseExpression(input);
		const term = { unit, ...(prefix ? { prefix } : {}), exponent: 1 };
		for (const Parser of [NearleyQtyParser, RegexQtyParser]) {
			const parser = new Parser();
			for (let repeat = 0; repeat < 2; repeat++) {
				const result = parser.parse(input);
				expect(result.scalar.toString()).toBe('1');
				expect(result.numerator).toEqual([term]);
				expect(result.denominator).toEqual([]);
			}
		}
	});

	it('preserves scaling, powers, reciprocals, grouping, and formatted identity', () => {
		expect(new Quantity('1 minch').to('inch').scalar.toString()).toBe('0.001');
		expect(new Quantity('min').to('s').scalar.toString()).toBe('60');
		for (const exponent of ['2', '^2', '^-2', '-2', '^0', '^1000000']) {
			expect(new Quantity(`minch${exponent}`).same(new Quantity(`milliinch${exponent}`))).toBe(true);
		}
		expect(new Quantity('2/minch.s').eq('2000/inch.s')).toBe(true);
		expect(new Quantity('(minch/s)^2').same(new Quantity('milliinch2/s2'))).toBe(true);
		expect(new Quantity('minch').units()).toBe('m"');
		expect(new Quantity('min').units()).toBe('min');
	});

	it('preserves every exact catalog alias', () => {
		const parser = new NearleyQtyParser();
		for (const [alias, unit] of Object.entries(UnitTokenManager.instance.getMap('unit'))) {
			const result = parser.parse(alias);
			expect(result.scalar.toString(), alias).toBe('1');
			expect(result.numerator, alias).toEqual(unit === '<1>' ? [] : [{ unit, exponent: 1 }]);
			expect(result.denominator, alias).toEqual([]);
		}
	});

	it('agrees with Regex on all catalog prefix and unit spellings', () => {
		const nearley = new NearleyQtyParser(), regex = new RegexQtyParser();
		const manager = UnitTokenManager.instance;
		for (const prefix of Object.keys(manager.getMap('prefix'))) {
			for (const [alias, unit] of Object.entries(manager.getMap('unit'))) {
				if (unit === '<1>') continue; // Scalar unity is not a physical unit alias.
				const input = prefix + alias;
				const actual = nearley.parse(input), expected = regex.parse(input);
				assert.deepEqual(actual.numerator, expected.numerator, input);
				assert.deepEqual(actual.denominator, expected.denominator, input);
				assert.equal(actual.scalar.toString(), expected.scalar.toString(), input);
			}
		}
	});

	it.each(['kkm', 'mminch', 'k m', 'minchunknown', 'minch2junk', 'minch-force', 'minch^', 'minch/'])
		('rejects malformed spelling %s and recovers', input => {
			const parser = new NearleyQtyParser();
			expect(() => parser.parse(input)).toThrow();
			expect(new Quantity(parser.parse('minch')).eq('0.001 inch')).toBe(true);
		});
});
