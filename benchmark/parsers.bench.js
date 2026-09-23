import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { NearleyQtyParser, RegexQtyParser } from '../dist/parsers/index.js';
import { compare } from './helpers.js';

const inputs = ['1 m', '1 m/s', '1 m/s^2', '3.5 kg.m/s^2', '-1.25e-3 km/s'];
for (const input of inputs)
{
	test(`parsers: ${input}`, async ({ bench }) => {
		const expected = new Quantity(input);
		const validate = definition => {
			assert(definition, 'Parser must produce a definition');
			assert(new Quantity(definition).same(expected));
		};
		const cases = [];
		for (const Parser of [RegexQtyParser, NearleyQtyParser])
		{
			const parser = new Parser();
			cases.push(
				{ name: `${Parser.name}: construct + parse`, run: () => new Parser().parse(input), validate },
				{ name: `${Parser.name}: reused instance`, run: () => parser.parse(input), validate },
			);
		}
		await compare(bench, cases);
	});
}

test('Nearley: grouped expression', async ({ bench }) => {
	const parser = new NearleyQtyParser();
	const expected = new Quantity('0.013 kg^2.s^2');
	await compare(bench, [{
		name: 'reused instance: 1.3e-2 (kg.s)^2',
		run: () => parser.parse('1.3e-2 (kg.s)^2'),
		validate: value => assert(new Quantity(value).eq(expected)),
	}]);
});
