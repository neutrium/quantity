import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { compare } from './helpers.js';

for (const [source, target, expected] of [['1 m', 'cm', '100'], ['3 in', 'ft', '0.25'], ['8 m', '1/m', '0.125']])
{
	test(`exact rounding: ${source} -> ${target}`, async ({ bench }) => {
		await compare(bench, [20, 100000].map(precision => {
			const Q = Quantity.withConfig({ precision });

			return {
				name: `precision ${precision}`,
				// Fresh quantities prevent the conversion-result cache from hiding work.
				run: () => new Q(source).to(target),
				validate: result => assert.equal(result.scalar.toString(), expected),
			};
		}));
	});
}
