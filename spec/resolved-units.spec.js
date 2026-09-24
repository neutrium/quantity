import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { QuantityCore, createQuantityClass } from '@neutrium/quantity/core';

describe('operations on resolved units', () => {
	it('never invokes the parser for existing operands, including temperature operations', () => {
		const parser = { parse() { throw new Error('Unexpected parsing'); } };
		const q = (scalar, numerator, denominator = ['<1>']) => new QuantityCore({
			scalar: new Decimal(scalar), numerator, denominator,
		}, undefined, parser);
		const a = q(2, ['<meter>']);
		const b = q(300, ['<centi>', '<meter>']);
		expect(a.add(b).scalar.toString()).toBe('5');
		expect(a.sub(b).scalar.toString()).toBe('-1');
		expect(a.mul(b).scalar.toString()).toBe('6');
		expect(b.div(a).scalar.toString()).toBe('1.5');
		expect(a.to(b).scalar.toString()).toBe('200');
		expect(a.lt(b)).toBe(true);
		const c = q(20, ['<temp-C>']);
		const f = q(50, ['<temp-F>']);
		const interval = q(18, ['<fahrenheit>']);
		expect(c.add(interval).scalar.toNumber()).toBeCloseTo(30, 12);
		expect(interval.add(c).scalar.toNumber()).toBeCloseTo(30, 12);
		expect(c.sub(interval).scalar.toNumber()).toBeCloseTo(10, 12);
		expect(c.sub(f).scalar.toNumber()).toBeCloseTo(10, 12);
		expect(c.to(f).scalar.toNumber()).toBeCloseTo(68, 12);
		expect(c.toBase().scalar.toString()).toBe('293.15');
	});

	it('passes only external strings to a JSON-only parser', () => {
		const calls = [];
		const Custom = createQuantityClass(() => ({ parse(text) {
			calls.push(text);
			const value = JSON.parse(text);
			return { scalar: new Decimal(value.scalar), numerator: value.numerator, denominator: ['<1>'] };
		} }));
		const input = scalar => JSON.stringify({ scalar, numerator: ['<meter>'] });
		const a = new Custom(input(2));
		const b = new Custom(input(3));
		expect(a.add(b).scalar.toString()).toBe('5');
		expect(a.clone().sub(b).scalar.toString()).toBe('-1');
		expect(a.to(b)).toBe(a);
		expect(a.add(input(4)).scalar.toString()).toBe('6');
		expect(calls).toEqual([input(2), input(3), input(4)]);
		expect(a.add(b)).toBeInstanceOf(Custom);
	});

	it('handles reciprocal units without reparsing their display strings', () => {
		const a = new Quantity('2 m^-1');
		const b = new Quantity('3 m^-1');
		expect(a.add(b).scalar.toString()).toBe('5');
		expect(a.div(b).scalar.toString()).toBe(new Decimal(2).div(3).toString());
		expect(new Quantity('2 m').to(new Quantity('0 m^-1')).scalar.toString()).toBe('0.5');
	});

	it('ignores Quantity target scalars while preserving string target semantics and caching', () => {
		const source = new Quantity('1 m');
		const zero = new Quantity('0 cm');
		const scaled = new Quantity('2 cm');
		expect(source.to('2 cm').scalar.toString()).toBe('50');
		expect(source.to(scaled).scalar.toString()).toBe('100');
		expect(source.to(zero).scalar.toString()).toBe('100');
		expect(source.to(zero)).toBe(source.to(zero));
		expect(source.to('cm')).toBe(source.to('cm'));
		expect(source.to('2 m')).toBe(source);
		expect(new Quantity('0 tempC').to(new Quantity('0 tempF')).scalar.toString()).toBe('32');
	});
});
