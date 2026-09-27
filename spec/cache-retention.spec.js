import { describe, expect, it, vi } from 'vitest';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { NearleyQtyParser, RegexQtyParser } from '@neutrium/quantity/parsers.js';


for (const Constructor of [Quantity, RegexQuantity]) {
	describe(`conversion cache retention with ${Constructor === Quantity ? 'Nearley' : 'Regex'}`, () => {
		it('shares equivalent target results and bounds expression retention', () => {
			const Parser = Constructor === Quantity ? NearleyQtyParser : RegexQtyParser;
			const parser = new Parser();
			const parse = vi.spyOn(parser, 'parse');
			const Q = Constructor.withConfig({ conversionCache: { maxEntries: 2 } });
			const source = new Q('1 m', undefined, parser);
			const first = source.to('cm');
			expect(source.to('0 cm')).toBe(first);
			expect(source.to('2 cm')).toBe(first);
			parse.mockClear();
			expect(source.to('2 cm')).toBe(first);
			expect(parse).not.toHaveBeenCalled();
			expect(source.to('cm')).toBe(first);
			expect(parse).toHaveBeenCalledTimes(1);
			expect(source.to('centimetre')).toBe(first);
			expect(source.to(new Constructor('0 cm'))).toBe(first);
			expect(first.scalar.toString()).toBe('100');
		});

		it('bounds distinct unit results and retains frequently used entries', () => {
			const Q = Constructor.withConfig({ conversionCache: { maxEntries: 2 } });
			const source = new Q('1 m');
			const hot = source.to('cm');
			const cold = source.to('m*s/s');
			expect(source.to('cm')).toBe(hot);
			let recent;
			for (let i = 2; i <= 4; i++) {
				recent = source.to(`m*s${i}/s${i}`);
				expect(recent.scalar.toString()).toBe('1');
				expect(source.to('cm')).toBe(hot);
			}
			expect(source.to('m*s4/s4')).toBe(recent);
			expect(source.to('cm')).toBe(hot);
			expect(source.to('m*s/s')).not.toBe(cold);
			expect(source.to('cm')).toBe(hot);
		});
	});
}

it('retains frequently used base metadata instead of clearing the entire shared cache', () => {
	const hot = new Quantity('km12345').toBase().numerator;
	const cold = new Quantity('km12346').toBase().numerator;
	for (let i = 0; i < 1100; i++) {
		new Quantity(`km${5000 + i}`);
		expect(new Quantity('km12345').toBase().numerator).toBe(hot);
	}
	const refreshed = new Quantity('km12346').toBase().numerator;
	expect(refreshed).toEqual(cold);
	expect(refreshed).not.toBe(cold);
});
