import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '../dist/Quantity.js';
import { Quantity as RegexQuantity } from '../dist/regex.js';

const max = Number.MAX_SAFE_INTEGER;
for (const Constructor of [Quantity, RegexQuantity]) {
	describe(`extreme scales with ${Constructor === Quantity ? 'Nearley' : 'Regex'}`, () => {
		it('cancels overflowing and underflowing factors before evaluating powers', () => {
			for (const units of ['km', 'mm', 'Yft', 'Kibyte']) {
				const input = `2 ${units}${max}/${units}${max}`;
				for (let repeat = 0; repeat < 2; repeat++) {
					const quantity = new Constructor(input);
					expect(quantity.baseScalar.toString(), input).toBe('2');
					expect(quantity.toBase().units(), input).toBe('');
					expect(quantity.to('1').scalar.toString(), input).toBe('2');
					// Resolving the scale must not change the user's counted units.
					expect(quantity.numerator[0].exponent).toBe(max);
					expect(quantity.denominator[0].exponent).toBe(max);
				}
			}
		});

		it('keeps small residual powers and their inverses exact', () => {
			for (const [units, expected] of [['km', '1000'], ['mm', '0.001'], ['Kibyte', '1024']]) {
				const quantity = new Constructor(`${units}${max}/${units}${max - 1}`);
				expect(quantity.baseScalar.toString()).toBe(expected);
				expect(quantity.toBase().numerator[0].exponent).toBe(1);
				expect(quantity.inverse().baseScalar.eq(new Decimal(1).div(expected))).toBe(true);
			}
		});

		it('cancels shared scales across different units and decimal prefixes', () => {
			const cases = [
				[`km${max}/ks${max}`, '1'],
				[`km${max}/ks${max - 1}`, '1000'],
				[`Kibyte${max}/Kis${max}`, '1'],
				['km4000000000000000*ms4000000000000000', '1'],
				['Mm2000000000000000/ks4000000000000000', '1'],
				['mm4000000000000000*ks4000000000000000', '1'],
				['km4000000000000000*ms3999999999999999', '1000'],
			];
			for (const [input, expected] of cases) {
				const quantity = new Constructor(input);
				expect(quantity.baseScalar.toString(), input).toBe(expected);
				expect(quantity.toBase().signature, input).toBe(quantity.signature);
			}
		});

		it('retains non-decimal unit factors after cancelling extreme prefixes', () => {
			const exponent = 4000000000000000;
			const expected = new Decimal('0.3048').pow(exponent);
			const quantity = new Constructor(`kft${exponent}/ks${exponent}`);
			expect(quantity.baseScalar.toString()).toBe(expected.toString());
			expect(quantity.inverse().baseScalar.toString()).toBe(new Decimal('0.3048').pow(-exponent).toString());
		});

		it('preserves genuine final overflow, underflow and unsafe dimension errors', () => {
			expect(new Constructor(`km${max}`).baseScalar.toString()).toBe('Infinity');
			expect(new Constructor(`mm${max}`).baseScalar.toString()).toBe('0');
			expect(() => new Constructor(`N${max}`)).toThrow(/safe integer/);
			expect(() => new Constructor(`km${max}*m`)).toThrow(/safe integer/);
		});
	});
}

it('cancels extreme factors in counted definitions during base conversion', () => {
	const terms = [{ unit: '<meter>', prefix: '<kilo>', exponent: max }];
	const base = new Quantity({ scalar: new Decimal(1), numerator: terms, denominator: terms }).toBase();
	expect(base.scalar.toString()).toBe('1');
	expect(base.units()).toBe('');
});
