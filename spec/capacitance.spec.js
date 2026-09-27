import { describe, expect, it } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { Quantity as RegexQuantity } from '../dist/regex.js';

for (const Constructor of [Quantity, RegexQuantity]) {
	describe(`capacitance with ${Constructor === Quantity ? 'Nearley' : 'Regex'}`, () => {
		it('converts between farads and prefixed farads in both directions', () => {
			const farad = new Constructor('1 farad');
			for (const [units, count] of [['millifarad', '1000'], ['microfarad', '1000000'], ['kilofarad', '0.001']]) {
				expect(farad.to(units).scalar.toString()).toBe(count);
				expect(new Constructor(`${count} ${units}`).to('farad').scalar.toString()).toBe('1');
				expect(farad.eq(`${count} ${units}`)).toBe(true);
			}
		});

		it('uses the catalog SI dimensions for every capacitance representation', () => {
			const farad = new Constructor('farad');
			expect(farad.isBase()).toBe(false);
			for (const units of ['coulomb/volt', 'ampere2*second4/kilogram/meter2', 'millifarad']) {
				expect(farad.isCompatible(units)).toBe(true);
			}
			expect(farad.to('coulomb/volt').scalar.toString()).toBe('1');
			expect(new Constructor('coulomb/volt').to('farad').scalar.toString()).toBe('1');
			const base = farad.toBase();
			expect(base.isBase()).toBe(true);
			expect(base.numerator).toEqual([
				{ unit: '<ampere>', exponent: 2 }, { unit: '<second>', exponent: 4 },
			]);
			expect(base.denominator).toEqual([
				{ unit: '<kilogram>', exponent: 1 }, { unit: '<meter>', exponent: 2 },
			]);
			expect(base.eq(farad)).toBe(true);
		});

		it('supports capacitance arithmetic, powers and reciprocals', () => {
			const farad = new Constructor('farad');
			expect(farad.add('500 millifarad').scalar.toString()).toBe('1.5');
			expect(farad.sub('500 millifarad').scalar.toString()).toBe('0.5');
			expect(farad.mul('2 volt').to('coulomb').scalar.toString()).toBe('2');
			expect(new Constructor('2 coulomb').div('2 volt').to('farad').scalar.toString()).toBe('1');
			expect(farad.pow(2).to('millifarad2').scalar.toString()).toBe('1000000');
			expect(farad.inverse().to('1/millifarad').scalar.toString()).toBe('0.001');
		});

		it('keeps million-sized capacitance powers counted', () => {
			const base = new Constructor('farad1000000').toBase();
			expect(base.numerator).toEqual([
				{ unit: '<ampere>', exponent: 2000000 }, { unit: '<second>', exponent: 4000000 },
			]);
			expect(base.denominator).toEqual([
				{ unit: '<kilogram>', exponent: 1000000 }, { unit: '<meter>', exponent: 2000000 },
			]);
			expect(base.scalar.toString()).toBe('1');
		});

		it('keeps capacitance distinct from temperature intervals', () => {
			const farad = new Constructor('farad');
			expect(farad.isCompatible('degF')).toBe(false);
			expect(() => farad.to('F')).toThrow('Incompatible units');
			expect(new Constructor('F').units()).toBe('degF');
		});
	});
}

it('supports capacitance conversion targets from another parser entry', () => {
	const farad = new Quantity('farad');
	const target = new RegexQuantity('0 millifarad');
	const result = farad.to(target);
	expect(result.scalar.toString()).toBe('1000');
	expect(result).toBeInstanceOf(Quantity);
	expect(farad.to(target)).toBe(result);
	expect(target.scalar.toString()).toBe('0');
});
