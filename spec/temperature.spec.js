var Quantity = require('../dist/Quantity').Quantity;

describe("Neutrium Quantity Temperature Tests", function() {
	it("should 32 tempF equal 0 tempC", function() {
		expect(new Quantity("32 tempF").to("tempC").scalar.valueOf()).toEqual("0");
	});

	it("should 500 tempF equal 269 tempC", function() {
		expect(new Quantity("500 tempF").to("tempC").scalar.valueOf()).toEqual("260");
	});

	it("should 500 tempK equal 226.85 tempC", function() {
		expect(new Quantity("500 tempK").to("tempC").scalar.valueOf()).toEqual("226.85");
	});

	it("should 500 tempK equal 900 tempR", function() {
		expect(new Quantity("500 tempK").to("tempR").scalar.valueOf()).toEqual("900");
	});
});