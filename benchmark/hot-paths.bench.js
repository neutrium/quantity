import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { Quantity as NumberQuantity } from '../dist/number.js';
import { scale } from '../dist/operations/unit-scale.js';
import { compare } from './helpers.js';

for (const [name, Q] of [['Decimal', Quantity], ['double', NumberQuantity]])
{
	test(`numeric hot paths: ${name}`, async ({ bench }) => {
		const source = new Q('36 km/h'), target = new Q('1 m/s');
		const increment = new Q('1 km/h');
		const numeric = source.numeric;
		const values = Array.from({ length: 32 }, (_, index) => numeric.from(36 * (index + 1)));
		let index = 0;
		const validate = value => assert.equal(numeric.toNumber(value.scalar), 36);
		await compare(bench, [
			{ name: 'construct scalar', run: () => new Q(36), validate },
			{ name: 'construct expression', run: () => new Q('36 km/h'), validate },
			{ name: 'construct scalar with units', run: () => new Q(36, 'km/h'), validate },
			{ name: 'same-unit addition result', run: () => source.add(increment),
				validate: value => assert.equal(numeric.toNumber(value.scalar), 37) },
			{ name: 'scalar multiplication result', run: () => source.mul(2),
				validate: value => assert.equal(numeric.toNumber(value.scalar), 72) },
			{ name: 'clone existing scalar', run: () => source.clone(), validate },
			{ name: 'clone and read input snapshot', run: () => source.clone().initValue,
				validate: value => { validate(value); assert(Object.isFrozen(value)); } },
			{
				// Exercise numerical conversion, not Quantity's cached results.
				// Different values share the same source/target unit plan.
				name: 'reused unit scale, varying scalars',
				run: () => { index = (index + 1) % values.length; return scale(values[index], source, target, numeric); },
				validate: value => assert.equal(numeric.toNumber(value), 10 * (index + 1)),
			},
		]);
	});
}
