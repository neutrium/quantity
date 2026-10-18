import { describe, expect, it } from 'vitest';
import { UnitTokenManager } from '../dist/UnitTokenManager.js';
import { basePowers } from '../dist/operations/unit-powers.js';

describe('counted catalog dimensions', () => {
	const manager = UnitTokenManager.instance;

	it('coalesces repeated dimensions in catalog order', () => {
		const farad = manager.getUnit('<farad>');
		expect(farad.numerator).toEqual([
			{ unit: '<ampere>', exponent: 2 }, { unit: '<second>', exponent: 4 },
		]);
		expect(farad.denominator).toEqual([
			{ unit: '<kilogram>', exponent: 1 }, { unit: '<meter>', exponent: 2 },
		]);
	});

	it('shares immutable dimensions between units in each category', () => {
		const categories = new Map();
		for (const definition of Object.values(manager.values)) {
			const first = categories.get(definition.category);
			if (first) {
				expect(definition.numerator).toBe(first.numerator);
				expect(definition.denominator).toBe(first.denominator);
			} else categories.set(definition.category, definition);
			for (const side of [definition.numerator, definition.denominator]) {
				expect(Object.isFrozen(side)).toBe(true);
				for (const term of side) expect(Object.isFrozen(term)).toBe(true);
			}
		}
		const newton = manager.getUnit('<newton>'), dyne = manager.getUnit('<dyne>');
		expect(newton.scalar).toBe(1);
		expect(dyne.scalar).toBe(1e-5);
		expect(() => { newton.denominator[0].exponent = 3; }).toThrow(TypeError);
		expect(dyne.denominator[0].exponent).toBe(2);
	});

	it('uses empty arrays for dimensionless units, missing sides, and prefixes', () => {
		const unity = manager.getUnit('<1>'), metre = manager.getUnit('<meter>'), kilo = manager.getUnit('<kilo>');
		expect(unity.numerator).toEqual([]);
		expect(unity.denominator).toBe(unity.numerator);
		expect(metre.denominator).toBe(unity.numerator);
		expect(kilo.numerator).toBe(unity.numerator);
		expect(kilo.denominator).toBe(unity.numerator);
	});

	it('checks multiplied counts and accumulated counts before cancellation', () => {
		const exponent = Math.floor(Number.MAX_SAFE_INTEGER / 4);
		const farad = { unit: '<farad>', exponent };
		const [numerator] = basePowers({ numerator: [farad], denominator: [] });
		expect(numerator).toEqual([
			{ unit: '<ampere>', exponent: 2 * exponent }, { unit: '<second>', exponent: 4 * exponent },
		]);
		for (const inverse of [false, true]) {
			const structure = (num, den) => inverse ? { numerator: den, denominator: num }
				: { numerator: num, denominator: den };
			expect(() => basePowers(structure([{ ...farad, exponent: exponent + 1 }], []))).toThrow('safe integer');
			expect(() => basePowers(structure([farad, { unit: '<second>', exponent: 4 }],
				[{ unit: '<second>', exponent: Number.MAX_SAFE_INTEGER }]))).toThrow('safe integer');
		}
	});
});
