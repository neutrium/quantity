import { describe, expect, it, vi } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { Quantity as RegexQuantity } from '../dist/regex.js';
import { createQuantityClass } from '../dist/core.js';
import { RegexQtyParser } from '../dist/parsers/RegexQtyParser.js';

for (const Constructor of [Quantity, RegexQuantity]) {
	describe(`inverse dimensions with ${Constructor === Quantity ? 'Nearley' : 'Regex'}`, () => {
		it('ignores scalars, including zero and non-finite values', () => {
			const inverse = new Quantity('0 m^-1');
			for (const scalar of [0, -2, 3, NaN, Infinity]) {
				const value = new Constructor(scalar, 'm');
				expect(value.isInverse(inverse)).toBe(true);
				expect(inverse.isInverse(value)).toBe(true);
				expect(value.isInverse('s')).toBe(false);
			}
			expect(new Constructor('0').isInverse('0')).toBe(true);
		});

		it('compares compound, derived, prefixed and large-power dimensions', () => {
			for (const [a, b, expected] of [
				['km/s2', 's2/cm', true], ['km/s2', 's/cm', false],
				['farad', 'V/coulomb', true], ['farad', 'coulomb/V', false],
				['m9007199254740991', 'm^-9007199254740991', true],
				['m9007199254740991', 'm^-9007199254740990', false],
				['m20/s', 's20/m', false], ['0 m', '0 m', false],
			]) {
				expect(new Constructor(a).isInverse(b), `${a} versus ${b}`).toBe(expected);
			}
		});

		it('keeps dimensional checks separate from temperature inversion restrictions', () => {
			const temperature = new Constructor('20 tempC');
			const reciprocal = new Constructor('1/degK');
			expect(temperature.isInverse(reciprocal)).toBe(true);
			expect(reciprocal.isInverse(temperature)).toBe(true);
			expect(temperature.isInverse('m')).toBe(false);
			expect(() => temperature.inverse()).toThrow('Cannot divide with temperatures');
			expect(() => temperature.to(reciprocal)).toThrow('Cannot divide with temperatures');
			const zero = new Constructor('0 m');
			expect(() => zero.inverse()).toThrow('Divide by zero');
			expect(() => zero.to('1/m')).toThrow('Divide by zero');
			expect(() => zero.to('s')).toThrow('Incompatible units');
		});

		it('constructs no temporary quantities for existing operands', () => {
			let constructions = 0;
			class Counted extends Constructor {
				constructor(...args) { super(...args); constructions++; }
			}
			const source = new Counted('2 m');
			const target = new Quantity('0 cm^-1');
			constructions = 0;
			expect(source.isInverse(target)).toBe(true);
			expect(source.isInverse(source)).toBe(false);
			expect(constructions).toBe(0);
			expect(source.isInverse('1/m')).toBe(true);
			expect(constructions).toBe(1); // Only the supplied string operand.
			constructions = 0;
			const result = source.to(target);
			expect(result).toBeInstanceOf(Counted);
			expect(result.scalar.toString()).toBe('0.005');
			expect(constructions).toBe(1); // Only the final result; no rounded reciprocal intermediate.
		});
	});
}

it('parses string operands once using the configured parser', () => {
	const regex = new RegexQtyParser();
	const parse = vi.fn(text => regex.parse(text.replaceAll('metres', 'm')));
	const Custom = createQuantityClass(() => ({ parse }));
	const source = new Custom('0 metres');
	const target = new RegexQuantity('1/m');
	parse.mockClear();
	expect(source.isInverse(target)).toBe(true);
	expect(parse).not.toHaveBeenCalled();
	expect(source.isInverse('metres^-1')).toBe(true);
	expect(parse).toHaveBeenCalledExactlyOnceWith('metres^-1', source.decimal);
	expect(() => source.isInverse('not_a_unit')).toThrow();
});
