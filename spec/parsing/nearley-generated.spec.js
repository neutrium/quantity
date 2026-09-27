import { expect, it, vi } from 'vitest';
import { lexer } from '../../dist/parsers/qty-grammar.js';
import { NearleyQtyParser } from '../../dist/parsers/NearleyQtyParser.js';
import { RegexQtyParser } from '../../dist/parsers/RegexQtyParser.js';
import { fullParse } from '../helpers/nearley.js';
import { Quantity } from '../../dist/Quantity.js';

// Each test starts its own sequence, so filtering or reordering tests changes no inputs.
function createGenerator(seed = 0x5eed) {
	function choose(values) {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return values[seed % values.length];
	}
	function expression(depth) {
		if (!depth) return choose(['m', 'cm', 's', 'kg', 'minch', '2', '.5', '1e-2', 'm⁻²', 's**2']);
		const left = expression(depth - 1), right = expression(depth - 1);
		return choose([`(${left}*${right})`, `(${left}/${right})`, `(${left}·${right})`, `(${left} ${right})`, `(${left})²`]);
	}
	return { choose, expression };
}

it('generated nested expressions have one parse and identical cached/uncached semantics', () => {
	const { expression } = createGenerator();
	const parser = new NearleyQtyParser();
	for (let i = 0; i < 180; i++) {
		const suffix = expression(i % 3);
		for (const scalar of ['2', '-.5e1', '0']) {
			const input = `${scalar} ${suffix}`;
			const expected = fullParse(input);
			expect(parser.parse(input), input).toEqual(expected);
			expect(new NearleyQtyParser().parse(input), input).toEqual(expected);
			const quantity = new Quantity(expected);
			const roundTrip = new Quantity(`${quantity.scalar.toString()} ${quantity.units()}`);
			expect(roundTrip.same(quantity), input).toBe(true);
		}
		for (const malformed of [`2 ${suffix}/`, `2 ${suffix}**`, `2 ${suffix})`, `2 ${suffix}*unknownxyz`])
			expect(parser.tryParse(malformed).success, malformed).toBe(false);
	}
});

it('generated shared syntax agrees with Regex across aliases, powers, and operator precedence', () => {
	const { choose } = createGenerator();
	const nearley = new NearleyQtyParser(), regex = new RegexQtyParser();
	for (let i = 0; i < 250; i++) {
		const left = choose(['m', 'cm', 'km', 'minch', 'kg', 'ampere']);
		const right = choose(['s', 'ms', 'h', 'mol']);
		const operator = choose(['*', '/', '.', ' ', '\t', ' / ', ' . ']);
		const power = choose(['2', '^-2', '**3', '^0']);
		const input = `${choose(['2', '1e-3', '-.5', '0'])} ${left}${operator}${right}${power}`;
		expect(nearley.parse(input), input).toEqual(regex.parse(input));
	}
});

it('a cache miss scans the scalar prefix once and continues the existing lexer', () => {
	const input = ' \t123.5e-2 (km*ampere/s)**37';
	const counting = lexer.clone().reset(input);
	const tokens = Array.from(counting).length;
	const original = lexer.clone.bind(lexer);
	const nextCalls = [], resetCalls = [];
	const clone = vi.spyOn(lexer, 'clone').mockImplementation(() => {
		const value = original();
		nextCalls.push(vi.spyOn(value, 'next'));
		resetCalls.push(vi.spyOn(value, 'reset'));
		return value;
	});
	try {
		new NearleyQtyParser().parse(input);
		expect(nextCalls).toHaveLength(1);
		expect(nextCalls[0]).toHaveBeenCalledTimes(tokens + 1);
		expect(resetCalls[0]).toHaveBeenCalledTimes(1);
	} finally { clone.mockRestore(); }
});

it('evaluates long scalar operation chains iteratively', () => {
	const input = '2' + '*2/2'.repeat(1500) + ' m';
	const parser = new NearleyQtyParser();
	expect(parser.parse(input).scalar.toString()).toBe('2');
	expect(parser.parse(input.replace(/^2/, '3')).scalar.toString()).toBe('3');
});
