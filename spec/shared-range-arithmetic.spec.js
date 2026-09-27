import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';


for (const Entry of [Quantity, RegexQuantity]) {
	describe(`arithmetic after range changes: ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {
		it('recovers finite results consistently for equivalent units and numeric operands', () => {
			const a = new Entry('1e30 m'), b = new Entry('1e30 m'), cm = new Entry('1e32 cm');
			const negative = new Entry('-1e30 m'), negativeCm = new Entry('-1e32 cm');
			const tiny = new Entry('1e-30 m'), tinyCm = new Entry('1e-28 cm');
			const divisor = new Decimal('1e30');
			Decimal.config = { maxE: 20, minE: -20 };
			for (const target of [b, cm, divisor, 1e30]) expect(a.div(target).scalar.toString()).toBe('1');
			for (const target of [b, cm]) expect(a.sub(target).scalar.toString()).toBe('0');
			for (const target of [negative, negativeCm]) expect(a.add(target).scalar.toString()).toBe('0');
			for (const target of [tiny, tinyCm, 1e-30]) expect(a.mul(target).scalar.toString()).toBe('1');
			expect(tiny.mul(1e30).scalar.toString()).toBe('1');
			expect(tiny.div(1e-30).scalar.toString()).toBe('1');
			expect(a.scalar.toString()).toBe('1e+30');
			expect(tiny.scalar.toString()).toBe('1e-30');
		});

		it('adds tiny stored operands before enforcing the new minimum exponent', () => {
			const a = new Entry('6e-21 m'), b = new Entry('6e-19 cm');
			const negative = new Entry('-6e-21 m');
			Decimal.config = { minE: -20, maxE: 20 };
			expect(a.add(a).scalar.toString()).toBe('1.2e-20');
			expect(a.add(b).scalar.toString()).toBe('1.2e-20');
			expect(a.sub(negative).scalar.toString()).toBe('1.2e-20');
		});

		it('uses the current precision, rounding and final range for stored scalars', () => {
			const large = new Entry('1.23456789e30 m');
			const small = new Entry('1e-30 m');
			Decimal.config = { precision: 6, rounding: 'down', maxE: 20, minE: -40 };
			expect(large.div(1e30).scalar.toString()).toBe('1.23456');
			expect(large.pow(-1).scalar.toString()).toBe('8.1e-31');
			expect(large.mul(1).scalar.toString()).toBe('Infinity');
			Decimal.config = { rounding: 'up', maxE: 40, minE: -20 };
			expect(large.div(1e30).scalar.toString()).toBe('1.23457');
			expect(small.pow(-1).scalar.toString()).toBe('1e+30');
			expect(small.mul(1).scalar.isZero()).toBe(true);
			Decimal.config = { minE: -40 };
			expect(small.mul(1).scalar.toString()).toBe('1e-30');
		});

		it('preserves zero and nonfinite arithmetic instead of introducing spurious NaN', () => {
			const large = new Entry('1e30 m'), small = new Entry('1e-30 m');
			const make = (value, units) => new Entry(new Decimal(value), units);
			const zero = make(0, 'm'), zeroCm = make(0, 'cm');
			const infinity = make(Infinity, 'm'), infinityCm = make(Infinity, 'cm');
			const negativeInfinity = make(-Infinity, 'cm');
			Decimal.config = { maxE: 20, minE: -20 };
			for (const operand of [0, zero, zeroCm]) expect(large.mul(operand).scalar.isZero()).toBe(true);
			for (const operand of [new Decimal(Infinity), infinity, infinityCm]) expect(large.div(operand).scalar.isZero()).toBe(true);
			expect(large.add(negativeInfinity).scalar.toString()).toBe('-Infinity');
			expect(large.sub(infinityCm).scalar.toString()).toBe('-Infinity');
			expect(small.div(0).scalar.toString()).toBe('Infinity');
			expect(small.div(zeroCm).scalar.toString()).toBe('Infinity');
			expect(infinity.mul(0).scalar.isNaN()).toBe(true);
			expect(zero.div(zero).scalar.isNaN()).toBe(true);
		});

		it('adopts foreign Decimal contexts without clamping before arithmetic', () => {
			const Foreign = Decimal.clone({ precision: 40, rounding: 'up' });
			const metre = [{ unit: '<meter>', exponent: 1 }];
			const make = value => new Entry({ scalar: new Foreign(value), numerator: metre, denominator: [] });
			const large = make('1.23456789e30'), small = make('1e-30');
			Decimal.config = { precision: 6, rounding: 'down', minE: -20, maxE: 20 };
			for (const result of [large.div(1e30), large.mul(1e-30)]) {
				expect(result.scalar.toString()).toBe('1.23456');
				expect(result.scalar.constructor).toBe(Decimal);
			}
			expect(large.sub(large).scalar.isZero()).toBe(true);
			expect(small.mul(1e30).scalar.toString()).toBe('1');
			Decimal.config = { rounding: 'up' };
			expect(large.div(1e30).scalar.toString()).toBe('1.23457');
			expect(Foreign.config.precision).toBe(40);
		});
	});
}
