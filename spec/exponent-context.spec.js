import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';


for (const Entry of [Quantity, RegexQuantity]) {
	describe(`range-independent exponents: ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {
		it('rejects fractional powers before configured input underflow or rounding', () => {
			const Q = Entry.withConfig({ precision: 3, minE: -20 });
			for (const exponent of ['1e-30', '-1e-30', 1e-30, new Decimal('1e-30'), '1.000000000000000000001',
				'1e-9000000000000001', '-1e-9000000000000001', '0x1p-90000000000000000']) {
				expect(() => new Q('2 m').pow(exponent)).toThrow('fractional power');
			}
			expect(new Q('2 m').pow('0e-30').units()).toBe('');
			expect(new Q('2 m').pow('0x0p-90000000000000000').units()).toBe('');
		});

		it('retains valid integer exponents and applies limits only to the power result', () => {
			const Q = Entry.withConfig({ precision: 20, maxE: 0, minE: -20 });
			for (const exponent of [100, '100', '1e2', new Decimal(100)]) {
				expect(new Q('1 m').pow(exponent).units()).toBe('m100');
			}
			expect(new Q('1 m').pow(-100).units()).toBe('1/m100');
			expect(new Q('0.9 m').pow(10).scalar.toString()).toBe('0.3486784401');
			expect(new Q('2 m').pow(10).scalar.toString()).toBe('Infinity');
			expect(new Q('0.1 m').pow(100).scalar.isZero()).toBe(true);
			expect(() => new Q('1 m').pow('9007199254740992')).toThrow('safe integer');
		});

		it('does not inherit later shared range changes when validating exponents', () => {
			const Q = Entry.withConfig({ maxE: 0, minE: -20 });
			Decimal.config = { maxE: 0, minE: -2 };
			expect(new Q('1 m').pow(100).units()).toBe('m100');
			expect(() => new Q('1 m').pow('1e-30')).toThrow('fractional power');
			expect(new Entry('1 m').pow(100).units()).toBe('m100');
		});
	});
}

it('keeps Nearley exponent literals exact on cache misses and hits across configurations', () => {
	const Reference = Decimal.clone({ precision: 50, minE: -100, maxE: 100 });
	const cases = [
		['(0.9 m)^10', '0.3486784401', 'm10'],
		['(0.9 m)^+10', '0.3486784401', 'm10'],
		['(1.0 m)^100', '1', 'm100'],
		['(1.0 m)^-100', '1', '1/m100'],
		['(0.9 m)¹⁰', '0.3486784401', 'm10'],
		['((0.9 m)^2)^10', new Reference('0.9').pow(20).toString(), 'm20'],
		['0.9^1e1 m', '0.3486784401', 'm'],
		['2^1e-30 m', new Reference(2).pow('1e-30').toString(), 'm'],
		['2^-1e-30 m', new Reference(2).pow('-1e-30').toString(), 'm'],
	];
	for (const maxE of [0, 10, 0]) {
		const Q = Quantity.withConfig({ precision: 50, maxE, minE: -20 });
		for (const [input, expected, units] of cases) {
			const result = new Q(input);
			expect(result.scalar.toString(), input).toBe(expected);
			expect(result.units(), input).toBe(units);
		}
	}
	const Q = Quantity.withConfig({ maxE: 0, minE: -20 });
	expect(new Q('(2 m)^10').scalar.toString()).toBe('Infinity');
	expect(new Q('(0.1 m)^100').scalar.isZero()).toBe(true);
	expect(() => new Q('(1 m)^9007199254740992')).toThrow('safe integer');
});
