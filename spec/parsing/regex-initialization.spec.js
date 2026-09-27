import { expect, it, vi } from 'vitest';
import { RegexQtyParser } from '../../dist/parsers/RegexQtyParser.js';
import { Quantity } from '../../dist/regex.js';
import { UnitTokenManager } from '../../dist/UnitTokenManager.js';

it('initializes patterns once across parsers and the regex Quantity entry', () => {
	const getMap = vi.spyOn(UnitTokenManager.instance, 'getMap');
	try {
		const parser = new RegexQtyParser();
		expect(getMap.mock.calls).toEqual([['prefix'], ['unit']]);
		getMap.mockClear();

		// Distinct unit expressions exercise scans, not just parsed-unit cache hits.
		const cases = [
			['2 km/s', [{ unit: '<meter>', prefix: '<kilo>', exponent: 1 }], [{ unit: '<second>', exponent: 1 }]],
			['3 kg*m', [{ unit: '<kilogram>', exponent: 1 }, { unit: '<meter>', exponent: 1 }], []],
			['4 cm/min', [{ unit: '<meter>', prefix: '<centi>', exponent: 1 }], [{ unit: '<minute>', exponent: 1 }]],
		];
		for (const [input, numerator, denominator] of cases) {
			const result = new RegexQtyParser().parse(input);
			expect(result.numerator).toEqual(numerator);
			expect(result.denominator).toEqual(denominator);
			expect(new Quantity(input).scalar.toString()).toBe(input[0]);
		}
		expect(() => parser.parse('1 definitely_not_a_unit')).toThrow();
		expect(new RegexQtyParser().parse('5 mm/h').numerator).toEqual([{ unit: '<meter>', prefix: '<milli>', exponent: 1 }]);
		expect(getMap).not.toHaveBeenCalled();

		// Preserve explicit initialization for existing callers.
		parser.initialize();
		expect(getMap.mock.calls).toEqual([['prefix'], ['unit']]);
		getMap.mockClear();
		expect(new Quantity('1 m').to('cm').scalar.toString()).toBe('100');
		expect(getMap).not.toHaveBeenCalled();
	} finally {
		getMap.mockRestore();
	}
});
