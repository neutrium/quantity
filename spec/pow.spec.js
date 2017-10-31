var Quantity = require('../dist/Quantity').Quantity;

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

	it("should (10m)^0.5 throw Error", function() {
		expect(() => new Quantity("10m").pow(0.5)).toThrow(new Error("Raising quantities to a fractional power not currently supported"));
	});
});