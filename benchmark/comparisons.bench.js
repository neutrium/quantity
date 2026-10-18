import assert from 'node:assert/strict';
import { test } from 'vitest';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
import { NumberAdapter } from '@neutrium/utilities/number';
import { createQuantityClass } from '../dist/factory.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';
import { compare } from './helpers.js';

for (const numeric of [new DecimalScientificAdapter(), new NumberAdapter()])
{
	for (const cache of [true, false])
	{
		test(`cross-unit comparisons: ${numeric.id}, cache ${cache}`, async ({ bench }) => {
			const Q = createQuantityClass({ numeric, parser: c => new RegexParser(c), config: { cache } });
			const inputs = [
				['decimal scale, equal', '1 m', '100 cm', 0],
				['fractional scale, unequal', '1 ft', '12.01 in', -1],
				['compound units, equal', '36 km/h', '10 m/s', 0],
				['negative values, equal', '-12 in', '-1 ft', 0],
				['same-unit control', '1 m', '2 m', -1],
			];

			if (numeric instanceof DecimalScientificAdapter)
			{
				inputs.push(
					['large factored scale', '1 ft10000', '1 m10000', -1],
					['large decimal exponent', '1 mm1000000', '1 m1000000', -1],
				);
			}

			await compare(bench, inputs.map(([name, left, right, expected]) => {
				const a = new Q(left), b = new Q(right);
				return { name, run: () => a.compareTo(b), validate: result => assert.equal(result, expected) };
			}));
		});
	}
}
