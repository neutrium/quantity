import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { scalarTerm } from '../dist/operations/exact-sum.js';
import { compare } from './helpers.js';

for (const [name, Q] of [['Decimal', Quantity]])
{
	test(`rational caches: ${name}`, async ({ bench }) => {
		const source = new Q('36 km/h'), target = new Q('1 m/s');
		const numeric = source.numeric;
		await compare(bench, [
			{
				name: 'extract reused scalar', run: () => scalarTerm(source.scalar, numeric),
				validate: value => assert.equal(Number(value.numerator) * 10 ** Number(value.exponent), 36),
			},
			{
				name: 'extract fresh scalar', run: () => scalarTerm(numeric.from(36), numeric),
				validate: value => assert.equal(Number(value.numerator) * 10 ** Number(value.exponent), 36),
			},
			{
				name: 'add reused cross-unit operands', run: () => source.add(target),
				validate: value => assert.equal(numeric.toNumber(value.scalar), 39.6),
			},
		]);
	});
}
