import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { Quantity as NumberQuantity } from '../dist/number.js';
import { compare } from './helpers.js';

for (const [backend, Base] of [['Decimal', Quantity], ['double', NumberQuantity]])
{
	test(`cache policy: ${backend}`, async ({ bench }) => {
		const cases = [];
		for (const [name, cache] of [['defaults', true], ['scalar terms off', { scalarTerms: false }], ['all off', false]])
		{
			const Q = Base.withConfig({ cache });
			const source = new Q('36 km/h'), target = new Q('1 m/s');
			const validate = expected => value => assert.equal(value.numeric.toNumber(value.scalar), expected);
			cases.push(
				{ name: `${name}: add reused cross-unit operands`, run: () => source.add(target), validate: validate(39.6) },
				{ name: `${name}: add fresh cross-unit operands`, run: () => new Q('36 km/h').add(new Q('1 m/s')), validate: validate(39.6) },
				{ name: `${name}: repeated conversion`, run: () => source.to(target), validate: validate(10) },
			);
		}
		await compare(bench, cases);
	});
}
