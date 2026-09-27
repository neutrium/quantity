import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { QuantityCore, createQuantityClass } from '@neutrium/quantity/core';

describe('operations on resolved units', () => {
	it('never invokes the parser for existing operands, including temperature operations', () => {
		const parser = { parse() { throw new Error('Unexpected parsing'); } };
		const q = (scalar, numerator, denominator = []) => new QuantityCore({
			scalar: new Decimal(scalar), numerator, denominator,
		}, undefined, parser);
		const a = q(2, [{ unit: '<meter>', exponent: 1 }]);
		const b = q(300, [{ unit: '<meter>', prefix: '<centi>', exponent: 1 }]);
		expect(a.add(b).scalar.toString()).toBe('5');
		expect(a.sub(b).scalar.toString()).toBe('-1');
		expect(a.mul(b).scalar.toString()).toBe('6');
		expect(b.div(a).scalar.toString()).toBe('1.5');
		expect(a.to(b).scalar.toString()).toBe('200');
		expect(a.lt(b)).toBe(true);
		const c = q(20, [{ unit: '<temp-C>', exponent: 1 }]);
		const f = q(50, [{ unit: '<temp-F>', exponent: 1 }]);
		const interval = q(18, [{ unit: '<fahrenheit>', exponent: 1 }]);
		expect(c.add(interval).scalar.toNumber()).toBeCloseTo(30, 12);
		expect(interval.add(c).scalar.toNumber()).toBeCloseTo(30, 12);
		expect(c.sub(interval).scalar.toNumber()).toBeCloseTo(10, 12);
		expect(c.sub(f).scalar.toNumber()).toBeCloseTo(10, 12);
		expect(c.to(f).scalar.toNumber()).toBeCloseTo(68, 12);
		expect(c.toBase().scalar.toString()).toBe('293.15');
		const reciprocalA = q(2, [], [{ unit: '<meter>', exponent: 1 }]);
		const reciprocalB = q(3, [], [{ unit: '<meter>', exponent: 1 }]);
		expect(reciprocalA.add(reciprocalB).scalar.toString()).toBe('5');
		expect(reciprocalA.div(reciprocalB).scalar.toString()).toBe(new Decimal(2).div(3).toString());
		expect(a.to(q(0, [], [{ unit: '<meter>', exponent: 1 }])).scalar.toString()).toBe('0.5');
	});

	it('passes only external strings to a JSON-only parser', () => {
		const calls = [];
		const Custom = createQuantityClass(() => ({ parse(text) {
			calls.push(text);
			const value = JSON.parse(text);
			return { scalar: new Decimal(value.scalar), numerator: value.numerator, denominator: [] };
		} }));
		const input = scalar => JSON.stringify({ scalar, numerator: [{ unit: '<meter>', exponent: 1 }] });
		const a = new Custom(input(2));
		const b = new Custom(input(3));
		expect(a.add(b).scalar.toString()).toBe('5');
		expect(a.clone().sub(b).scalar.toString()).toBe('-1');
		expect(a.to(b)).toBe(a);
		expect(a.add(input(4)).scalar.toString()).toBe('6');
		expect(calls).toEqual([input(2), input(3), input(4)]);
		expect(a.add(b)).toBeInstanceOf(Custom);
	});
});
