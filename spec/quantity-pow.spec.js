import { describe, expect, it } from 'vitest';
import { Quantity } from '../dist/Quantity.js'

describe("Neutrium Quantity Power Tests", function() {

	it("should (10m)^2 equal 100 m^2", function() {
		var q1 = new Quantity("10m").pow(2),
			q2 = new Quantity("100m^2");

		expect(q1.eq(q2)).toEqual(true);
	});

	it("should (10m)^-1 equal 0.1 m^-1", function() {
		var q1 = new Quantity("10m").pow(-1),
			q2 = new Quantity("0.1m^-1");

		expect(q1.eq(q2)).toEqual(true);
	});

	it("should (10m)^0.5 retain fractional units", function() {
		expect(new Quantity("10m").pow(0.5).units()).toBe("m^(1/2)");
	});

	it('accepts surrounding whitespace in exponent strings', () => {
		const area = new Quantity('4 m2');
		for (const exponent of ['2', '-2', '0.5', '5e-1', '1/2']) {
			expect(area.pow(' \t' + exponent + '\n').same(area.pow(exponent))).toBe(true);
		}
	});

	it('rejects blank exponents and whitespace within a literal', () => {
		const area = new Quantity('4 m2');
		for (const exponent of [' \t\n', '1 2', '1 / 2']) {
			expect(() => area.pow(exponent)).toThrow('Invalid exponent');
		}
	});
});
