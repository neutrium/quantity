import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { Quantity as NumberQuantity } from '../dist/number.js';
import { compare } from './helpers.js';

for (const [name, Entry] of [['Decimal', Quantity], ['double', NumberQuantity]]) for (const cache of [true, false])
{
	test(`temperature operations: ${name}, cache ${cache}`, async ({ bench }) => {
		const Q = Entry.withConfig({ cache });
		const source = new Q('20 tempC'), interval = new Q('1 degC');
		const other = new Q('10 tempC'), fahrenheit = new Q('68 tempF'), otherFahrenheit = new Q('50 tempF');
		const kelvin = new Q('293.15 tempK'), degreeKelvin = new Q('294 degK');
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
			{
				name: 'compare Celsius and Fahrenheit points', run: () => source.compareTo(otherFahrenheit),
				validate: order => assert.equal(order, 1),
			},
			{
				name: 'compare a Kelvin point and interval', run: () => kelvin.compareTo(degreeKelvin),
				validate: order => assert.equal(order, -1),
			},
		]);
	});
}
