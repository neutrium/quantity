import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { Quantity as NumberQuantity } from '../dist/number.js';
import { compare } from './helpers.js';

for (const [name, Q] of [['Decimal', Quantity], ['double', NumberQuantity]])
{
	test(`temperature constants: ${name}`, async ({ bench }) => {
		const source = new Q('20 tempC'), interval = new Q('1 degC');
		const other = new Q('10 tempC'), fahrenheit = new Q('68 tempF'), otherFahrenheit = new Q('50 tempF');
		await compare(bench, [
			{
				name: 'construct temperature', run: () => new Q('20 tempC'),
				validate: value => assert.equal(value.numeric.toNumber(value.scalar), 20),
			},
			{
				name: 'shift temperature with reused operands', run: () => source.add(interval),
				validate: value => assert.equal(value.numeric.toNumber(value.scalar), 21),
			},
			{
				name: 'subtract same-scale Celsius temperatures', run: () => source.sub(other),
				validate: value => assert.equal(value.numeric.toNumber(value.scalar), 10),
			},
			{
				name: 'subtract same-scale Fahrenheit temperatures', run: () => fahrenheit.sub(otherFahrenheit),
				validate: value => assert.equal(value.numeric.toNumber(value.scalar), 18),
			},
			{
				name: 'subtract cross-scale temperatures', run: () => source.sub(otherFahrenheit),
				validate: value => assert(Math.abs(value.numeric.toNumber(value.scalar) - 10) < 1e-12),
			},
		]);
	});
}
