import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';

const modes = ['up', 'down', 'ceil', 'floor', 'half-up', 'half-down', 'half-even', 'half-ceil', 'half-floor'];
const Wide = Decimal.clone({ precision: 240, minE: -Decimal.limits.maxExponent, maxE: Decimal.limits.maxExponent });

for (const Entry of [Quantity, RegexQuantity]) {
	describe(`consolidated rounding: ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {
		it.each(modes)('retains distant signed tails across unit spellings with %s', rounding => {
			const Q = Entry.withConfig({ precision: 3, rounding });
			const Reference = Decimal.clone(Q.config);
			for (const exponent of [100, 5000, 8999999999999998]) {
				for (const sign of ['', '-']) for (const tailSign of ['', '-']) {
					const value = sign + '1.005', tail = tailSign + `1e-${exponent + 2}`;
					const a = new Q(value + ' m');
					for (const operation of ['add', 'sub']) {
						const result = a[operation](tailSign + `1e-${exponent} cm`);
						expect(result.scalar.toString()).toBe(new Reference(value)[operation](new Wide(tail)).toString());
						expect(result.scalar.toString()).toBe(a[operation](tail + ' m').scalar.toString());
						expect(result.config).toBe(Q.config);
						expect(result.units()).toBe('m');
					}
				}
			}
		});

		it.each(modes)('rounds large counted factors and their sums using verified bounds with %s', rounding => {
			const Q = Entry.withConfig({ precision: 3, rounding });
			const Reference = Decimal.clone(Q.config);
			const factor = new Wide('0.3048').pow(5000);
			for (const sign of ['', '-']) {
				const a = new Q(sign + '1.005 m5000'), b = new Q('ft5000');
				expect(a.sub(b).scalar.toString()).toBe(new Reference(sign + '1.005').sub(factor).toString());
				expect(a.add(b).scalar.toString()).toBe(new Reference(sign + '1.005').add(factor).toString());
				expect(new Q(sign + '1 ft5000').to('m5000').scalar.toString())
					.toBe((sign ? factor.neg() : factor).toSD(3, rounding).toString());
			}
			expect(new Q('ft5000').to('1/m5000').scalar.toString()).toBe(new Wide(1).div(factor).toSD(3, rounding).toString());
		});

		it.each(modes)('keeps reciprocal temperature offsets exact with %s', rounding => {
			const Q = Entry.withConfig({ precision: 20, rounding });
			for (const zeroKelvin of ['273.15', '255.3722222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222']) {
				// Two nearby terminating inputs on opposite sides of the reciprocal.
				const reciprocal = new Wide(1).div(zeroKelvin).toSD(100, 'down');
				for (const input of [reciprocal, reciprocal.add('1e-102')]) {
					const a = new Q(input.toString() + ' /degK');
					const kelvin = new Wide(1).div(input);
					for (const [target, numerator, denominator, offset] of [
						['tempC', 1, 1, '273.15'], ['tempF', 9, 5, '459.67'],
						['tempK', 1, 1, '0'], ['tempR', 9, 5, '0'],
					]) {
						const expected = kelvin.mul(numerator).div(denominator).sub(offset).toSD(20, rounding);
						expect(a.to(target).scalar.toString()).toBe(expected.toString());
						expect(a.to(target).config).toBe(Q.config);
					}
				}
			}
			const input = new Wide(1).div('273.15').toSD(100);
			expect(new Q(input.toString() + ' /degK').to('tempC').scalar.toString())
				.toBe(new Wide(1).div(input).sub('273.15').toSD(20, rounding).toString());
		});

		it('validates reciprocal temperatures before even extreme underflow', () => {
			const Q = Entry.withConfig({ precision: 4, rounding: 'down' });
			const huge = 'km4000000000000000/m4000000000000000/degK';
			for (const [target, minimum] of [['tempC', '-273.15'], ['tempF', '-459.67'], ['tempK', '0'], ['tempR', '0']]) {
				expect(() => new Q('-1 ' + huge).to(target)).toThrow('absolute zero');
				expect(new Q('1 ' + huge).to(target).scalar.gte(minimum)).toBe(true);
				expect(() => new Q('0 /degK').to(target)).toThrow('Divide by zero');
			}
			const Narrow = Q.withConfig({ minE: -2, maxE: 2 });
			const inverse = new Narrow('0.003660992128866922936115687351272194764781255720300201354567087680761486362804319970712062969064616511 /degK');
			// Input falls below the configured range; construction has already made it zero.
			expect(() => inverse.to('tempC')).toThrow('Divide by zero');
		});

		it('preserves cancellation, special values and signed zero through the shared sum path', () => {
			const Q = Entry.withConfig({ precision: 20 });
			expect(new Q('1.0000000000000000000000001e100000 m').sub('1e100002 cm').scalar.toString()).toBe('1e+99975');
			for (const sign of ['', '-']) {
				expect(new Q(sign + '1 ft5000').sub(sign + '1 ft5000*s/s').scalar.isZero()).toBe(true);
				expect(new Q(sign + '1 m5000').sub(sign + '1 m5000*s/s').scalar.isZero()).toBe(true);
			}
			expect(new Q('-0 m').add('-0 cm').scalar.isNeg()).toBe(true);
			const inf = new Q(new Decimal(Infinity), '1/degK');
			expect(inf.to('tempC').scalar.toString()).toBe('-273.15');
			expect(new Q(new Decimal(NaN), '1/degK').to('tempC').scalar.isNaN()).toBe(true);
		});

		it('refines large-factor bounds beyond the initial working precision', () => {
			const Q = Entry.withConfig({ precision: 100, rounding: 'half-even' });
			const expected = new Wide('0.3048').pow(5000).toSD(100, 'half-even');
			expect(new Q('ft5000').to('m5000').scalar.toString()).toBe(expected.toString());
			expect(new Q('m5000').to('1/ft5000').scalar.toString()).toBe(expected.toString());
			const Narrow = Q.withConfig({ minE: -90 });
			expect(() => new Narrow('-1 m10000/ft10000/degK').to('tempC')).toThrow('absolute zero');
		});

		it('applies result limits after cancellation and keeps isolated configurations', () => {
			const Q = Entry.withConfig({ precision: 20, minE: -120, maxE: 20 });
			const input = new Wide(1).div('273.15').toSD(100).toString();
			const a = new Q(input + ' /degK');
			Decimal.config = { precision: 1, minE: -1, maxE: 1 };
			expect(a.to('tempC').scalar.toString()).toBe('5.5586025e-99');
			const Narrow = Q.withConfig({ minE: -90 });
			expect(new Narrow(input + ' /degK').to('tempC').scalar.isZero()).toBe(true);
		});
	});
}
