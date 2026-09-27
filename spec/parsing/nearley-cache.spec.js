import { describe, expect, it, vi } from 'vitest';
import Nearley from 'nearley/lib/nearley.js';
import { fullParse } from '../helpers/nearley.js';
import { NearleyQtyParser } from '../../dist/parsers/NearleyQtyParser.js';

describe('Nearley unit-expression cache', () => {
	it('shares units across scalars and instances without sharing mutable definitions', () => {
		const a = new NearleyQtyParser();
		const b = new NearleyQtyParser();
		const feed = vi.spyOn(Nearley.Parser.prototype, 'feed');
		try {
			const first = a.parse('2 (km*s)**17');
			const second = b.parse('-1e3 (km*s)**17');
			expect(feed).toHaveBeenCalledTimes(1);
			const powered = a.parse('2 ** 3 (km*s)**17');
			expect(feed).toHaveBeenCalledTimes(2);
			expect(a.parse('3 ** 3 (km*s)**17').scalar.toString()).toBe('27');
			expect(feed).toHaveBeenCalledTimes(2);
			expect(second.scalar.toString()).toBe('-1000');
			expect(powered.scalar.toString()).toBe('8');
			expect(second).not.toBe(first);
			expect(second.numerator).toBe(first.numerator);
			expect(Object.isFrozen(second.numerator)).toBe(true);
			expect(Object.isFrozen(second.numerator[0])).toBe(true);
			first.numerator = [];
			first.scalar = null;
			expect(b.parse('3 (km*s)**17').numerator).toBe(second.numerator);
			expect(b.parse('3 (km*s)**17').scalar.toString()).toBe('3');
		} finally { feed.mockRestore(); }
	});

	it.each([
		['1eV', '2eV', '+3eV'],
		['1Em', '2Em', '.5Em'],
		['2/s', '3/s', '2**3/s'],
		['2/(1/s)', '3/(1/s)', '2^3/(1/s)'],
		['2 1/s', '3 1/s', '2**3 1/s'],
		['2 kg/m.s', '3 kg/m.s', '4 kg/m*s', '5 kg/m s'],
		['m^2', ' m^2 ', '\tm^2\n'],
		['2', '-.5e2', '2 ** -3', '+2 ^ +3'],
		['2 (m/s)**-2', ' \t3 (m/s)**-2\n', '2e1 ** 2e0 (m/s)**-2'],
	])('matches the full grammar on misses and hits for %j', (...inputs) => {
		const parser = new NearleyQtyParser();
		for (let repeat = 0; repeat < 2; repeat++) {
			for (const input of inputs) expect(parser.parse(input)).toEqual(fullParse(input));
		}
	});

	it('does not let cached plans bypass validation of malformed scalars', () => {
		const parser = new NearleyQtyParser();
		for (const input of ['2/s', '2/(1/s)', '2 m', '2', '2 1/s']) parser.parse(input);
		for (const input of ['', ' \t', '2** m', '2***3 m', '2^ m',
			'2e m', '2**3**4 m', 'm**1e3', 'm**2.0', 'm**9007199254740992']) {
			expect(() => parser.parse(input), input).toThrow();
		}
		expect(parser.parse('3/s')).toEqual(fullParse('3/s'));
		expect(parser.parse('/s')).toEqual(fullParse('/s'));
		expect(parser.parse('/(1/s)')).toEqual(fullParse('/(1/s)'));
	});
});
