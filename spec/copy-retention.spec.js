import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '../dist/Quantity.js';
import { Quantity as RegexQuantity } from '../dist/regex.js';

for (const Constructor of [Quantity, RegexQuantity])
{
	describe(`copy input retention with ${Constructor === Quantity ? 'Nearley' : 'Regex'}`, () => {
		it('keeps a value snapshot instead of retaining the previous quantity', () => {
			class Custom extends Constructor {}
			let previous = new Custom('2 km');

			for (let i = 0; i < 1000; i++)
			{
				previous.to('cm'); // Source has a conversion cache that the copy must not retain.
				const copy = i % 2 ? previous.clone() : new Custom(previous);
				expect(copy).toBeInstanceOf(Custom);
				expect(copy.initValue).not.toBe(previous);
				expect(Object.keys(copy.initValue).sort()).toEqual(['denominator', 'numerator', 'scalar']);
				expect(copy.initValue.scalar).toBe(copy.scalar);
				expect(copy.initValue.numerator).toBe(previous.numerator);
				expect(copy.initValue.denominator).toBe(previous.denominator);
				expect(copy.to('cm')).not.toBe(previous.to('cm'));
				expect(copy.baseScalar.toString()).toBe('2000');
				previous = copy;
			}
		});

		it('snapshots normalized definitions without retaining extra input references', () => {
			const source = {
				scalar: new Decimal(3),
				numerator: [{ unit: '<meter>', exponent: 1 }, { unit: '<meter>', exponent: 1 }],
				denominator: [],
				owner: new Constructor('4 m')
			};
			const copy = new Constructor(source);
			// Mutate the external definition before the first snapshot read.
			source.scalar = new Decimal(99);
			source.numerator[0].exponent = 9;
			expect(copy.initValue).not.toBe(source);
			expect(copy.initValue).toEqual({ scalar: copy.scalar, numerator: copy.numerator, denominator: copy.denominator });
			expect(copy.initValue.numerator).not.toBe(source.numerator);
			expect(copy.initValue.scalar.toString()).toBe('3');
			expect(copy.initValue.numerator).toEqual([{ unit: '<meter>', exponent: 2 }]);
			expect(copy.units()).toBe('m2');
		});

		it.each([true, false, { metadata: false }])('keeps stable frozen snapshots after calculations with cache %j', cache => {
			const Q = Constructor.withConfig({ cache });
			const source = new Q('2 m');
			for (const result of [new Q(source), source.clone(), source.add('1 m'), source.to('cm')])
			{
				result.toBase();
				result.units();
				const snapshot = result.initValue;
				expect(result.initValue).toBe(snapshot);
				expect(snapshot).not.toBe(source);
				expect(snapshot).toEqual({ scalar: result.scalar, numerator: result.numerator, denominator: result.denominator });
				expect(Object.isFrozen(snapshot)).toBe(true);
				expect(() => { snapshot.scalar = new Decimal(100); }).toThrow(TypeError);
			}
		});

		it('preserves the original input for string and scalar construction', () => {
			expect(new Constructor('2 km').initValue).toBe('2 km');
			expect(new Constructor(2, 'km').initValue).toBe(2);
			const scalar = new Decimal(2);
			expect(new Constructor(scalar, 'km').initValue).toBe(scalar);
		});
	});
}
