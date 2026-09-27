import { describe, expect, it } from 'vitest';
import { NearleyQtyParser } from '../../dist/parsers/NearleyQtyParser.js';
import { RegexQtyParser } from '../../dist/parsers/RegexQtyParser.js';
import { UnitTokenManager } from '../../dist/UnitTokenManager.js';

function distinctTerms(count) {
	const manager = UnitTokenManager.instance;
	const result = [];
	for (const prefix of new Set(Object.values(manager.getMap('prefix')))) {
		for (const [unit, definition] of Object.entries(manager.values)) {
			if (definition.category === 'prefix' || unit === '<1>' || unit.startsWith('<temp-')) continue;
			result.push({ alias: manager.getUnitOutput(unit, prefix), term: { unit, prefix, exponent: 1 } });
			if (result.length === count) return result;
		}
	}
	throw new Error('Insufficient distinct catalog terms');
}

describe('Nearley long unit expressions', () => {
	it('returns ordered frozen counters for thousands of distinct terms and safely caches them', () => {
		const terms = distinctTerms(2000);
		const input = terms.map(({ alias }) => alias).join('*');
		const parser = new NearleyQtyParser();
		const first = parser.parse('2 ' + input);
		expect(first.numerator).toEqual(terms.map(({ term }) => term));
		expect(first.denominator).toEqual([]);
		expect(Object.isFrozen(first.numerator)).toBe(true);
		expect(() => { first.numerator[0].exponent = 2; }).toThrow(TypeError);
		const cached = parser.parse('3 ' + input);
		expect(cached.numerator).toBe(first.numerator);
		expect(cached.scalar.toString()).toBe('3');
		first.numerator = [];
		expect(parser.parse('4 ' + input).numerator).toBe(cached.numerator);
	});

	it('handles a deep left-associated product without recursive traversal', () => {
		const parser = new NearleyQtyParser();
		const result = parser.parse(Array(10000).fill('m').join('*'));
		expect(result.numerator).toEqual([{ unit: '<meter>', exponent: 10000 }]);
		expect(result.denominator).toEqual([]);
	});

	it('agrees with Regex on mixed operators and signed powers in a long expression', () => {
		const terms = distinctTerms(400);
		const separators = ['*', '/', '.', ' '];
		const powers = [0, -2, 3, 1];
		const input = terms.map(({ alias }, index) =>
			(index ? separators[index % separators.length] : '') + alias + '^' + powers[index % powers.length]).join('');
		expect(new NearleyQtyParser().parse(input)).toEqual(new RegexQtyParser().parse(input));
	});

	it('preserves side order through nested division and negative group powers', () => {
		const parser = new NearleyQtyParser();
		expect(parser.parse('kg/(m/(s*ampere).mol)')).toEqual(parser.parse('kg*s*ampere*mol/m'));
		expect(parser.parse('kg/(m/(s*ampere)*mol)')).toEqual(parser.parse('kg*s*ampere/m/mol'));
		expect(parser.parse('(kg/(m/s)*ampere)^-2')).toEqual(parser.parse('m2/kg2/s2/ampere2'));
		expect(parser.parse('(m*m/s)^2')).toEqual(parser.parse('m4/s2'));
		const max = '9007199254740991';
		expect(parser.parse(`m${max}/m${max}`).numerator[0].exponent).toBe(Number.MAX_SAFE_INTEGER);
		expect(parser.parse(`(m${max}/m${max})^0`).numerator).toEqual([]);
	});

	it.each([
		'm9007199254740991*m',
		'(m9007199254740991*m)^0',
		'(m9007199254740991*m)^-1',
		'(m9007199254740991*m)/(m9007199254740991*m)',
		'((m9007199254740991)^2)^0',
		'1/(m9007199254740991*m)^0',
	])('rejects intermediate count overflow in %s, including before zero powers', input => {
		const parser = new NearleyQtyParser();
		for (let repeat = 0; repeat < 2; repeat++) expect(() => parser.parse(input)).toThrow(/safe integer/);
		expect(parser.parse('m2').numerator).toEqual([{ unit: '<meter>', exponent: 2 }]);
	});
});
