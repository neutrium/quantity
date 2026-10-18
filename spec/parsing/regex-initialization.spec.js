import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const testNumeric = new DecimalScientificAdapter();
import { expect, it, vi } from 'vitest';
import { RegexParser } from '../../dist/parsers/RegexParser.js';
import { Quantity } from '../../dist/regex.js';
import { UnitTokenManager } from '../../dist/UnitTokenManager.js';

it('initializes patterns once across parsers and the regex Quantity entry', () => {
	const getMap = vi.spyOn(UnitTokenManager.instance, 'getMap');
	try
	{
		const parser = new RegexParser();
		expect(getMap.mock.calls).toEqual([['prefix'], ['unit']]);
		getMap.mockClear();

		// Distinct unit expressions exercise scans, not just parsed-unit cache hits.
		const cases = [
			['2 km/s', [{ unit: '<meter>', prefix: '<kilo>', exponent: 1 }], [{ unit: '<second>', exponent: 1 }]],
			['3 kg*m', [{ unit: '<kilogram>', exponent: 1 }, { unit: '<meter>', exponent: 1 }], []],
			['4 cm/min', [{ unit: '<meter>', prefix: '<centi>', exponent: 1 }], [{ unit: '<minute>', exponent: 1 }]],
		];

		for (const [input, numerator, denominator] of cases)
		{
			const result = new RegexParser().parse(input, testNumeric);
			expect(result.numerator).toEqual(numerator);
			expect(result.denominator).toEqual(denominator);
			expect(new Quantity(input).scalar.toString()).toBe(input[0]);
		}

		expect(() => parser.parse('1 definitely_not_a_unit', testNumeric)).toThrow();
		expect(new RegexParser().parse('5 mm/h', testNumeric).numerator).toEqual([{ unit: '<meter>', prefix: '<milli>', exponent: 1 }]);
		expect(getMap).not.toHaveBeenCalled();

		// Preserve explicit initialization for existing callers.
		parser.initialize();
		expect(getMap.mock.calls).toEqual([['prefix'], ['unit']]);
		getMap.mockClear();
		expect(new Quantity('1 m').to('cm').scalar.toString()).toBe('100');
		expect(getMap).not.toHaveBeenCalled();
	}
	finally
	{
		getMap.mockRestore();
	}
});
