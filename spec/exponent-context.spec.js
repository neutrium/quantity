import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';


for (const Entry of [Quantity, RegexQuantity]) {
	describe(`range-independent exponents: ${Entry === Quantity ? 'Pratt' : 'Regex'}`, () => {
		it.each([
			['a small positive literal', '1e-30'], ['a small negative literal', '-1e-30'],
			['a native number', 1e-30], ['a Decimal', new Decimal('1e-30')],
			['a literal close to one', '1.000000000000000000001'],
		])('retains fractional dimensions for %s before configured input underflow or rounding', (_, exponent) => {
			const Q = Entry.withConfig({ numeric: { precision: 3, minE: -20 } });
			const result = new Q('2 m').pow(exponent);
			expect(result.isUnitless()).toBe(false);
			expect(typeof (result.numerator[0] ?? result.denominator[0]).exponent).toBe('object');
		});

		it('recognizes a decimal zero exponent and rejects an invalid exponent', () => {
			const Q = Entry.withConfig({ numeric: { precision: 3, minE: -20 } });
			expect(new Q('2 m').pow('0e-30').units()).toBe('');
			expect(() => new Q('2 m').pow('0x0p-90000000000000000')).toThrow('Invalid exponent');
		});

		it('retains valid integer exponents and applies limits only to the power result', () => {
			const Q = Entry.withConfig({ numeric: { precision: 20, maxE: 0, minE: -20 } });
			for (const exponent of [100, '100', '1e2', new Decimal(100)])
			{
				expect(new Q('1 m').pow(exponent).units()).toBe('m100');
			}
			expect(new Q('1 m').pow(-100).units()).toBe('1/m100');
			expect(new Q('0.9 m').pow(10).scalar.toString()).toBe('0.3486784401');
			expect(new Q('2 m').pow(10).scalar.toString()).toBe('Infinity');
			expect(new Q('0.1 m').pow(100).scalar.isZero()).toBe(true);
			expect(() => new Q('1 m').pow('9007199254740992')).toThrow('safe integer');
		});

		it('does not inherit later shared range changes when validating exponents', () => {
			const Q = Entry.withConfig({ numeric: { maxE: 0, minE: -20 } });
			Decimal.config = { maxE: 0, minE: -2 };
			expect(new Q('1 m').pow(100).units()).toBe('m100');
			expect(new Q('1 m').pow('1e-30').numerator[0].exponent).toEqual({ numerator: 1n, denominator: 10n ** 30n });
			expect(new Entry('1 m').pow(100).units()).toBe('m100');
		});
	});
}

describe('Pratt exponent literals across configurations', () => {
	describe.each([
		['(0.9 m)^10', '0.3486784401', 'm10'],
		['(0.9 m)^+10', '0.3486784401', 'm10'],
		['(1.0 m)^100', '1', 'm100'],
		['(1.0 m)^-100', '1', '1/m100'],
		['(0.9 m)¹⁰', '0.3486784401', 'm10'],
		['((0.9 m)^2)^10', '0.12157665459056928801', 'm20'],
		['0.9^1e1 m', '0.3486784401', 'm'],
		['2^1e-30 m', '1.0000000000000000000000000000006931471805599453094', 'm'],
		['2^-1e-30 m', '0.99999999999999999999999999999930685281944005469058', 'm'],
	])('%s', (input, expected, units) => {
		const Base = Quantity.withConfig({ cache: true });
		it.each([['cold', 0], ['warm', 10], ['warm again', 0]])('%s parser cache, maxE=%i', (_, maxE) => {
			const Q = Base.withConfig({ numeric: { precision: 50, maxE, minE: -20 } });
			const result = new Q(input);
			expect(result.scalar.toString()).toBe(expected);
			expect(result.units()).toBe(units);
		});
	});

	it('applies the configured range and safe-integer limit', () => {
		const Q = Quantity.withConfig({ numeric: { maxE: 0, minE: -20 } });
		expect(new Q('(2 m)^10').scalar.toString()).toBe('Infinity');
		expect(new Q('(0.1 m)^100').scalar.isZero()).toBe(true);
		expect(() => new Q('(1 m)^9007199254740992')).toThrow('safe integer');
	});
});
