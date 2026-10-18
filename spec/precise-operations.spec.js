import { describe, expect, it } from 'vitest';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';

for (const Entry of [Quantity, RegexQuantity])
{
	describe(`precise operations: ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {

		it('preserves significant input digits in comparisons and handles huge powers', () => {
			const Q = Entry.withConfig({ numeric: { precision: 6 } });
			const H = Entry.withConfig({ numeric: { precision: 60 } });
			const a = new Q('1 km4000000000000000');
			const b = new H('1.' + '0'.repeat(80) + '1 km4000000000000000*s/s');
			expect(a.compareTo(b)).toBe(-1);
			expect(b.compareTo(a)).toBe(1);
			expect(new Q('16 oz10000').compareTo('16 lb10000')).toBe(-1);
			expect(new Q('1 ft10000').compareTo('1 m10000')).toBe(-1);
			expect(new Q('-1 ft10000').compareTo('-1 m10000')).toBe(1);
			expect(new Q('1 ft10000').compareTo('1 ft10000*s/s')).toBe(0);
		});

		it('handles reciprocal absolute-temperature targets with their offsets', () => {
			const Q = Entry.withConfig({ numeric: { precision: 20 } });
			expect(new Q('0.01/degK').to('tempC').scalar.toString()).toBe('-173.15');
		});
	});
}

it('uses consistent exact US liquid volume definitions at high precision', () => {
	const Q = Quantity.withConfig({ numeric: { precision: 60 } });
	for (const [input, target, expected] of [
		['pint(us fl)', 'pint(usl)', '1'], ['quart', 'quart(usl)', '1'],
		['gal(us)', 'pint', '8'], ['gal(us)', 'quart', '4'],
		['gal(us)', 'floz(us)', '128'], ['gal(us)', 'in3', '231'],
	]) expect(new Q(input).to(target).scalar.toString()).toBe(expected);
});
