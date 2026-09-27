import { describe, expect, it } from 'vitest';
import { Quantity } from '../dist/Quantity.js'

describe("Neutrium Quantity Basic Tests", function() {

	it("should create quantity from initialization string '1m'", function() {
		var q = new Quantity("1 m");

		expect(q.scalar.toNumber()).toEqual(1);
		expect(q.numerator).toEqual([{ unit: '<meter>', exponent: 1 }])
	});

	it("should create quantity from initialization value of 1 and string '1m'", function() {
		var q = new Quantity(1, 'm');

		expect(q.scalar.toNumber()).toEqual(1);
		expect(q.numerator).toEqual([{ unit: '<meter>', exponent: 1 }])
	});

	it("should create quantity from complex initialization string '1 km/s^2'", function() {
		var q = new Quantity("1 km/s^2");

		expect(q.scalar.toNumber()).toEqual(1);
		expect(q.numerator).toEqual([{ unit: '<meter>', prefix: '<kilo>', exponent: 1 }]);
		expect(q.denominator).toEqual([{ unit: '<second>', exponent: 2 }]);
	});

	it("should convert between quantities", function() {
		var q = new Quantity("1 m").to('ft');

		expect(q.scalar.toDP(5).toNumber()).toEqual(3.28084);
		expect(q.numerator).toEqual([{ unit: '<foot>', exponent: 1 }]);
		expect(q.denominator).toEqual([]);
	});

	it("should identify incompatible quantities", function() {
		var q1 = new Quantity("1 m"),
			q2 = new Quantity("1 rad");

		expect(q1.isCompatible(q2)).toEqual(false);
	});
});