import { describe, expect, it } from 'vitest';
import { NearleyQtyParser, RegexQtyParser } from '@neutrium/quantity/parsers.js';

describe('consistent decimal unit exponent rejection', () => {
	it.each(['m^2.1', 'm^2.10', 'm^2.1/s', 'm**-2.1', 'm2.1', 'm-2.1',
		'kg/m^2.1', 'm^2.0', 'm^0.1', 'm.1', 'm.1.s'])('rejects %s with either parser', input => {
		for (const Parser of [NearleyQtyParser, RegexQtyParser]) {
			const parser = new Parser();
			parser.parse('m2'); // A related successful plan must not affect rejection.
			for (let repeat = 0; repeat < 2; repeat++) expect(() => parser.parse(input)).toThrow();
		}
	});

	it.each(['kg/m.s', 'kg/m.s^2', 'm^2.s', 'm**-2.s', 'm2.s', 'm^2*1', 'm^2. 1',
		'm^2 . 1', '1.25 m2/s', '.5 kg/m.s'])('preserves unambiguous products and scalars: %s', input => {
		expect(new RegexQtyParser().parse(input)).toEqual(new NearleyQtyParser().parse(input));
	});
});
