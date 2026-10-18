import assert from 'node:assert/strict';
import { test } from 'vitest';
import { sameUnits } from '../dist/operations/unit-identity.js';
import { normalizePowers } from '../dist/operations/unit-powers.js';
import { CacheScope } from '../dist/utils/CacheScope.js';
import { resolveQuantityCache } from '../dist/QuantityConfig.js';
import { compare } from './helpers.js';

const batchSize = 1024;
const tokens = ['<meter>', '<second>', '<kilogram>', '<mole>', '<ampere>', '<radian>', '<kelvin>', '<byte>'];
const structure = length => ({
	numerator: normalizePowers(tokens.slice(0, length).map((unit, index) => ({ unit, exponent: index + 1 }))),
	denominator: normalizePowers([{ unit: '<dollar>', exponent: 2 }]),
});

for (const cache of [true, false])
{
	test(`unit identity: metadata ${cache ? 'enabled' : 'disabled'}, ${batchSize} comparisons/batch`, async ({ bench }) => {
		const scope = new CacheScope(resolveQuantityCache({ metadata: cache }));
		const cases = [];

		for (const length of [1, 8])
		{
			const source = structure(length), equal = structure(length);
			const unequal = { ...equal, denominator: normalizePowers([{ unit: '<dollar>', exponent: 3 }]) };
			const unequalNumeratorLength = structure(length === 1 ? 2 : 7);
			const unequalDenominatorLength = { ...equal, denominator: normalizePowers([]) };

			for (const [label, target, expected] of [
				['shared arrays', source, batchSize], ['equal records', equal, batchSize], ['unequal records', unequal, 0],
				['unequal numerator lengths', unequalNumeratorLength, 0], ['unequal denominator lengths', unequalDenominatorLength, 0],
			]) {
				cases.push({
					name: `${length} numerator records, ${label}`,
					run: () => {
						let matches = 0;
						for (let i = 0; i < batchSize; i++) if (sameUnits(source, target, scope)) matches++;
						return matches;
					},
					validate: result => assert.equal(result, expected),
				});
			}
		}

		if (process.env.BENCH_REVERSE === '1')
		{
			cases.reverse();
		}

		await compare(bench, cases);
	});
}
