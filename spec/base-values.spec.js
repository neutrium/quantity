import { describe, expect, it, vi } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { Quantity as RegexQuantity } from '../dist/regex.js';

for (const Constructor of [Quantity, RegexQuantity]) {
	describe(`base values with ${Constructor === Quantity ? 'Nearley' : 'Regex'}`, () => {
		it('constructs only the requested quantity with cold and warm unit metadata', () => {
			let constructions = 0;
			class Counted extends Constructor {
				constructor(...args) { super(...args); constructions++; }
			}
			for (const [input, baseScalar] of [
				['2 km', '2000'], ['3 farad', '3'], ['32 tempF', '273.15'], ['491.67 tempR', '273.15'],
				['18 degF', '10'], ['2 km/s2', '2000'], ['1 ym7', '1e-168'],
			]) {
				for (let repeat = 0; repeat < 2; repeat++) {
					constructions = 0;
					const quantity = new Counted(input);
					expect(constructions, input).toBe(1);
					expect(quantity.baseScalar.toString(), input).toBe(baseScalar);
					constructions = 0;
					const base = quantity.toBase();
					expect(constructions, input).toBe(1);
					expect(base).toBeInstanceOf(Counted);
					expect(base.scalar.toString(), input).toBe(baseScalar);
					expect(base.signature).toBe(quantity.signature);
				}
			}
		});

		it('constructs only the result for base and scaled arithmetic and copies', () => {
			let constructions = 0;
			class Counted extends Constructor {
				constructor(...args) { super(...args); constructions++; }
			}
			for (const [units, factor] of [['m', 1], ['km', 1000]]) {
				const a = new Counted(`6 ${units}`);
				const b = new Counted(`2 ${units}`);
				for (const [run, scalar, baseScalar] of [
					[() => a.add(b), '8', String(8 * factor)], [() => a.sub(b), '4', String(4 * factor)],
					[() => a.mul(b), '12', String(12 * factor * factor)], [() => a.div(b), '3', '3'],
					[() => a.mul(2), '12', String(12 * factor)], [() => a.clone(), '6', String(6 * factor)],
					[() => new Counted(a), '6', String(6 * factor)],
				]) {
					constructions = 0;
					const result = run();
					expect(constructions).toBe(1);
					expect(result).toBeInstanceOf(Counted);
					expect(result.scalar.toString()).toBe(scalar);
					expect(result.baseScalar.toString()).toBe(baseScalar);
				}
				expect(a.scalar.toString()).toBe('6');
				expect(b.scalar.toString()).toBe('2');
			}
		});

		it('constructs only the result for arithmetic with different units and parser entries', () => {
			let constructions = 0;
			class Counted extends Constructor {
				constructor(...args) { super(...args); constructions++; }
			}
			const Other = Constructor === Quantity ? RegexQuantity : Quantity;
			const a = new Counted('6 m'), b = new Other('200 cm');
			const create = vi.spyOn(b, 'createQuantity');
			try {
				for (const [operation, expected] of [['add', '8'], ['sub', '4']]) {
					constructions = 0;
					expect(a[operation](b).scalar.toString()).toBe(expected);
					expect(constructions).toBe(1);
					expect(create).not.toHaveBeenCalled();
				}
				expect(b.scalar.toString()).toBe('200');
			} finally { create.mockRestore(); }
		});

		it('uses existing conversion targets directly, including zero and reciprocal targets', () => {
			let constructions = 0;
			class Counted extends Constructor {
				constructor(...args) { super(...args); constructions++; }
			}
			const source = new Counted('2 km');
			const target = new Quantity('0 cm');
			constructions = 0;
			const result = source.to(target);
			expect(constructions).toBe(1);
			expect(result.scalar.toString()).toBe('200000');
			expect(result).toBeInstanceOf(Counted);
			constructions = 0;
			expect(source.to(target)).toBe(result);
			expect(constructions).toBe(0);
			expect(source.to(new Quantity('0 cm^-1')).scalar.toString()).toBe('0.000005');
			expect(source.to('2 m').scalar.toString()).toBe('2000');
		});

		it('converts temperature intervals without a temporary kelvin quantity', () => {
			let constructions = 0;
			class Counted extends Constructor {
				constructor(...args) { super(...args); constructions++; }
			}
			for (const [input, units, scalar] of [
				['18 degF', 'degC', '10'], ['20 tempC', 'degF', '36'],
				['36 tempF', 'degK', '20'], ['20 degC', 'tempK', '20'],
			]) {
				const source = new Counted(input);
				const target = new Constructor('0 ' + units);
				constructions = 0;
				const result = source.to(target);
				expect(constructions).toBe(1);
				expect(result).toBeInstanceOf(Counted);
				expect(result.scalar.toString()).toBe(scalar);
			}
		});
	});
}

it('initializes base values without invoking the public toBase override', () => {
	class Custom extends Quantity {
		toBase() { throw new Error('Explicit conversion only'); }
	}
	expect(new Custom('2 km').baseScalar.toString()).toBe('2000');
	expect(new Custom('32 tempF').baseScalar.toString()).toBe('273.15');
});
