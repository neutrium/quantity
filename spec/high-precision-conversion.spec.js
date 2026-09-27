import { it, expect } from 'vitest';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';

for (const Entry of [Quantity, RegexQuantity]) {
	it(`keeps exact conversions compact at high precision with ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {
		const Q = Entry.withConfig({ precision: 100000, maxOutputDigits: 30 });
		for (const [source, target, expected] of [['1 m', 'cm', '100'], ['3 in', 'ft', '0.25'],
			['8 m', '1/m', '0.125'], ['1 tempC', 'tempF', '33.8']]) {
			const result = new Q(source).to(target);
			expect(result.scalar.toString()).toBe(expected);
			expect(result.config).toBe(Q.config);
		}
		expect(new Q('1 m').add('25 cm').scalar.toString()).toBe('1.25');
		expect(new Q('33.8 tempF').sub('0 tempC').scalar.toString()).toBe('1.8');
	});
}
