import { describe, expect, it, vi } from 'vitest';
import { Quantity } from '@neutrium/quantity';
import { Quantity as NumberQuantity } from '@neutrium/quantity/number';
import { UnitTokenManager } from '../dist/UnitTokenManager.js';

describe('selective structural metadata reuse', () => {
	for (const [name, Base] of [['Decimal', Quantity], ['number', NumberQuantity]])
	{
		it(`reuses base dimensions for ${name} results with identical arrays`, () => {
			const Q = Base.withConfig({ cache: true });
			const a = new Q('2 kg*m/s2'), b = new Q('3 kg*m/s2');
			const lookup = vi.spyOn(UnitTokenManager.instance, 'getUnit');
			const results = [a.add(b), a.mul(3), a.clone(), new Q(a)];
			expect(lookup).not.toHaveBeenCalled();
			expect(results.map(result => result.scalar.toString())).toEqual(['5', '6', '2', '2']);

			for (const result of results)
			{
				expect(result.signature).toBe(a.signature);
				expect(result.isBase()).toBe(true);
				expect(result.numerator).toBe(a.numerator);
				expect(result.denominator).toBe(a.denominator);
			}
		});
	}

	it.each([false, { metadata: false }])('does not reuse metadata with cache=%j', cache => {
		const Q = NumberQuantity.withConfig({ cache });
		const source = new Q('2 kg*m/s2');
		source.mul(2);
		const lookup = vi.spyOn(UnitTokenManager.instance, 'getUnit');
		const result = source.mul(3);
		expect(lookup).toHaveBeenCalled();
		expect(result.signature).toBe(source.signature);
		expect(result.scalar).toBe(6);
	});

	it('bypasses structural cache access for unitless results', () => {
		const Q = NumberQuantity.withConfig({ cache: true });
		const a = new Q(2), b = new Q(3);
		const cache = vi.spyOn(a.cacheScope, 'get');
		const peek = vi.spyOn(a.cacheScope, 'peek');
		expect(a.add(b).scalar).toBe(5);
		expect(a.mul(3).scalar).toBe(6);
		expect(a.clone().isUnitless()).toBe(true);
		expect(cache).not.toHaveBeenCalled();
		expect(peek).not.toHaveBeenCalled();
	});

	it('allocates structural storage only when a result admits metadata', () => {
		const Q = NumberQuantity.withConfig({ cache: true });
		const source = new Q({ scalar: 2, numerator: [{ unit: '<meter>', exponent: 1 }], denominator: [] });
		const scope = source.cacheScope;
		expect(scope.stores).toBeUndefined();
		new Q(source);
		expect(scope.stores).toBeUndefined();
		const result = source.clone();
		expect(scope.stores.size).toBe(1);
		const lookup = vi.spyOn(UnitTokenManager.instance, 'getUnit');
		expect(new Q(result).signature).toBe(source.signature);
		expect(lookup).not.toHaveBeenCalled();
	});

	it('shares derived base units without sharing scalar values', () => {
		const Q = NumberQuantity.withConfig({ cache: true });
		const force = new Q('2 N'), scaled = force.mul(3);
		expect(scaled.isBase()).toBe(false);
		const first = force.toBase(), second = scaled.toBase();
		expect(first.scalar).toBe(2);
		expect(second.scalar).toBe(6);
		expect(first.numerator).toBe(second.numerator);
		expect(first.denominator).toBe(second.denominator);
		expect(first.units()).toBe('kg*m/s2');
	});

	it('keeps both sides in the key and does not admit fresh arrays automatically', () => {
		const Q = NumberQuantity.withConfig({ cache: true });
		const speed = new Q('2 m/s');
		speed.mul(2);
		const squaredTime = new Q({ scalar: 2, numerator: speed.numerator,
			denominator: [{ unit: '<second>', exponent: 2 }] });
		expect(squaredTime.signature).not.toBe(speed.signature);
		const lookup = vi.spyOn(UnitTokenManager.instance, 'getUnit');
		new Q(squaredTime);
		expect(lookup).toHaveBeenCalled();
		lookup.mockClear();
		const copied = new Q(speed);
		expect(lookup).not.toHaveBeenCalled();
		expect(copied.signature).toBe(speed.signature);
	});

	it('isolates admission between metadata scopes', () => {
		const Q = NumberQuantity.withConfig({ cache: true });
		const Other = Q.withConfig({ cache: true });
		const source = new Q('2 m/s');
		source.mul(2);
		const lookup = vi.spyOn(UnitTokenManager.instance, 'getUnit');
		const copied = new Other(source);
		expect(lookup).toHaveBeenCalled();
		expect(copied.signature).toBe(source.signature);
	});

	it('still validates scalars and absolute-zero boundaries after admission', () => {
		const Q = Quantity.withConfig({ cache: true });
		const temp = new Q('20 tempC');
		temp.mul(1);
		expect(() => temp.createResult(1, temp)).toThrow('Quantity scalar must be');
		expect(() => temp.createResult(temp.numeric.from(-274), temp)).toThrow('absolute zero');
		expect(temp.createResult(temp.numeric.from(-273.15), temp).scalar.toString()).toBe('-273.15');
	});

	it.each([true, false, { metadata: false }])('skips unit scans only when validated metadata is reusable, cache=%j', cache => {
		const Q = NumberQuantity.withConfig({ cache });
		const source = new Q('2 kg*m/s2');
		source.clone();
		const some = Array.prototype.some;
		let scans = 0;
		const spy = vi.spyOn(Array.prototype, 'some').mockImplementation(function (predicate, receiver) {
			if (this === source.numerator || this === source.denominator) scans++;
			return some.call(this, predicate, receiver);
		});
		let result;
		try
		{
			result = source.mul(3);
		}
		finally
		{
			spy.mockRestore();
		}

		expect(result.scalar).toBe(6);
		expect(result.signature).toBe(source.signature);
		expect(scans).toBe(cache === true ? 0 : 2);
	});

	it('validates altered temperature structures after admitting the original arrays', () => {
		const Q = NumberQuantity.withConfig({ cache: true });
		const temp = new Q('20 tempC');
		temp.clone();
		const second = { unit: '<second>', exponent: 1 };
		for (const units of [
			{ numerator: temp.numerator, denominator: [second] },
			{ numerator: [], denominator: temp.numerator },
			{ numerator: [...temp.numerator, second], denominator: temp.denominator },
			{ numerator: [{ ...temp.numerator[0], exponent: 2 }], denominator: temp.denominator },
			{ numerator: [{ ...temp.numerator[0], prefix: '<kilo>' }], denominator: temp.denominator },
		]) {
			expect(() => new Q({ scalar: 20, ...units })).toThrow(/Cannot (multiply|divide)/);
		}
	});

	it('recalculates metadata when a subclass changes the result units', () => {
		const Q = NumberQuantity.withConfig({ cache: true });
		class Redirected extends Q {
			constructQuantity(input, units, parser)
			{
				return new Q({ scalar: input.scalar, numerator: [{ unit: '<second>', exponent: 1 }],
					denominator: [] }, undefined, parser);
			}
		}
		const source = new Redirected('2 m'), result = source.mul(3);
		expect(result.scalar).toBe(6);
		expect(result.units()).toBe('s');
		expect(result.signature).not.toBe(source.signature);
	});

	it('does not replace subclass predicates or admit their overridden classifications', () => {
		const Q = NumberQuantity.withConfig({ cache: true });
		class NonBase extends Q { isBase() { return false; } }
		const source = new NonBase('2 m');
		source.mul(2);
		expect(new Q(source).isBase()).toBe(true);
		const ordinary = new Q('2 N');
		ordinary.mul(2);
		class BaseOverride extends Q { isBase() { return true; } }
		const fresh = new BaseOverride({ scalar: 2, numerator: ordinary.numerator.map(term => ({ ...term })),
			denominator: [] });
		const shared = new BaseOverride(ordinary);
		expect(shared.signature).toBe(fresh.signature);
		expect(shared.isBase()).toBe(true);
	});
});
