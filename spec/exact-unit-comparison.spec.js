import { describe, expect, it } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';
import { DecimalArithmeticAdapter } from '@neutrium/utilities/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';

describe('exact cross-unit comparison', () => {
	for (const Adapter of [DecimalArithmeticAdapter, DecimalScientificAdapter])
	{
		it.each([true, false])(`compares unrounded values outside the result range with ${Adapter.name}, cache=%s`, cache => {
			const numeric = new Adapter({ precision: 2, minE: -2, maxE: 2 });
			const Q = createQuantityClass({ numeric, parser: c => new RegexParser(c), config: { cache } });
			for (const [left, right, expected] of [
				['1 m', '100.000000000001 cm', -1],
				['-1 m', '-100.000000000001 cm', 1],
				['12 in', '1 ft', 0],
				['-12 in', '-1 ft', 0],
				['1 ft', '12.000000000001 in', -1],
				['-1 ft', '-12.000000000001 in', 1],
				['1 km1000000', '1 m1000000', 1],
				['-1 km1000000', '-1 m1000000', -1],
				['1 mm1000000', '1 m1000000', -1],
				['-1 mm1000000', '-1 m1000000', 1],
				// Large non-decimal scales still require the factored fallback.
				['1 ft10000', '1 m10000', -1],
				['-1 ft10000', '-1 m10000', 1],
			]) {
				const a = new Q(left), b = new Q(right);
				for (let repeat = 0; repeat < 2; repeat++)
				{
					expect(a.compareTo(b), `${left} vs ${right}`).toBe(expected);
					expect(b.compareTo(a)).toBe(expected === 0 ? 0 : -expected);
				}
			}
		});
	}
});
