import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { NearleyQtyParser, RegexQtyParser } from '../dist/parsers/index.js';
import { compare } from './helpers.js';

test('quantity construction', async ({ bench }) => {
	const expected = new Quantity('3.5 kg.m/s^2');
	const definition = new NearleyQtyParser().parse('3.5 kg.m/s^2');
	const regex = new RegexQtyParser();
	const validate = value => assert(value.same(expected));
	await compare(bench, [
		{ name: 'expression: default Nearley', run: () => new Quantity('3.5 kg.m/s^2'), validate },
		{ name: 'expression: reused Regex parser', run: () => new Quantity('3.5 kg.m/s^2', undefined, regex), validate },
		{ name: 'separate scalar and units', run: () => new Quantity('3.5', 'kg.m/s^2'), validate },
		{ name: 'preparsed definition', run: () => new Quantity(definition), validate },
	]);
});

for (const [input, target, output] of [
	['1 km', 'm', '1000 m'],
	['36 km/h', 'm/s', '10 m/s'],
	['32 tempF', 'tempC', '0 tempC'],
])
{
	test(`conversion: ${input} to ${target}`, async ({ bench }) => {
		const expected = new Quantity(output);
		const validate = value => assert(value.same(expected));
		const cached = Array.from({ length: 100 }, () => new Quantity(input));
		const cachedResults = cached.map(quantity => quantity.to(target));
		const batchResults = new Array(100);
		cachedResults.forEach(validate);
		let fresh;
		await compare(bench, [
			{ name: 'construct + first conversion', run: () => new Quantity(input).to(target), validate },
			{
				name: 'first conversion: fresh instance prepared outside timer',
				setup: () => { fresh = new Quantity(input); },
				run: () => fresh.to(target), validate,
			},
			{
				name: 'cached conversion: batch of 100 calls',
				run: () => {
					for (let i = 0; i < cached.length; i++) batchResults[i] = cached[i].to(target);
					return batchResults;
				},
				validate: values => values.forEach((value, index) => {
					validate(value);
					assert.strictEqual(value, cachedResults[index]);
				}),
			},
		]);
	});
}

test('arithmetic: reused operands', async ({ bench }) => {
	const length = new Quantity('10 m');
	const sameUnits = new Quantity('2 m');
	const otherUnits = new Quantity('200 cm');
	const duration = new Quantity('2 s');
	const cases = [
		['add: same units', () => length.add(sameUnits), '12 m'],
		['add: different units (warm conversion cache)', () => length.add(otherUnits), '12 m'],
		['subtract', () => length.sub(sameUnits), '8 m'],
		['multiply quantities', () => length.mul(sameUnits), '20 m^2'],
		['divide quantities', () => length.div(duration), '5 m/s'],
		['multiply scalar', () => length.mul(3), '30 m'],
		['integer power', () => length.pow(2), '100 m^2'],
		['negative integer power', () => length.pow(-1), '0.1 m^-1'],
	].map(([name, run, expression]) => {
		const expected = new Quantity(expression);
		return { name, run, validate: value => assert(value.eq(expected)) };
	});
	await compare(bench, cases);
	assert.equal(length.scalar.toString(), '10');
	assert.equal(otherUnits.scalar.toString(), '200');
});
