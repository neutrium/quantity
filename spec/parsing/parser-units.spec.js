import { describe, expect, it } from 'vitest';
import { NearleyQtyParser } from '../../dist/parsers/NearleyQtyParser.js'
import { RegexQtyParser } from '../../dist/parsers/RegexQtyParser.js';


[
	["NearleyQtyParser Unit Tests", new NearleyQtyParser()],
	["RegexQtyParser Unit Tests", new RegexQtyParser()]
]
.forEach(([description, parser]) => {
	describe("Neutrium Quantity - " + description, function() {

		describe("unit parsing logic", function() {

			it("can default to unity", function() {

				let x = parser.parse("m");

				expect(x.scalar.toString()).toEqual('1');
				expect(x.numerator).toEqual([{ unit: '<meter>', exponent: 1 }]);
				expect(x.denominator).toEqual([]);
			});

			it("correctly parses a unit", function() {
				let result = parser.parse("metre");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<meter>', exponent: 1 }]);
				expect(result.denominator).toEqual([]);
			});

			it("correctly parses a prefixed unit", function() {
				let result = parser.parse("km");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<meter>', prefix: '<kilo>', exponent: 1 }]);
				expect(result.denominator).toEqual([]);
			});

			it("correctly parses an ambigious prefixed unit", function() {
				let result = parser.parse("mm");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<meter>', prefix: '<milli>', exponent: 1 }]);
				expect(result.denominator).toEqual([]);
			});

			it("correctly parses a unit with parenthesis in the name", function() {
				let result = parser.parse("ton(l)");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<ton-long>', exponent: 1 }]);
				expect(result.denominator).toEqual([]);
			});
		});

		describe("unit to the power logic", function() {

			it("correctly parses a unit squared", function() {
				let result = parser.parse("m^2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<meter>', exponent: 2 }]);
				expect(result.denominator).toEqual([]);
			});

			it("correctly parses a unit squared without a ^", function() {
				let result = parser.parse("m2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<meter>', exponent: 2 }]);
				expect(result.denominator).toEqual([]);
			});

			it("correctly parses a unit to the power of a negative integer", function() {
				let result = parser.parse("m^-2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([]);
				expect(result.denominator).toEqual([{ unit: '<meter>', exponent: 2 }]);
			});

			it("correctly parses a prefixed unit squared", function() {
				let result = parser.parse("km^2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<meter>', prefix: '<kilo>', exponent: 2 }]);
				expect(result.denominator).toEqual([]);
			});

			it("correctly parses division units to the power of two", function() {
				let result = parser.parse("m/s^2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<meter>', exponent: 1 }]);
				expect(result.denominator).toEqual([{ unit: '<second>', exponent: 2 }]);
			});
		});

		describe("unit multiplication and division logic", function() {

			it("correctly parses a decimal point as a multiplier", function() {
				let result = parser.parse("kg.m");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<kilogram>', exponent: 1 }, { unit: '<meter>', exponent: 1 }]);
				expect(result.denominator).toEqual([]);
			});

			it("correctly parses a * as a multiplier", function() {
				let result = parser.parse("kg*m");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<kilogram>', exponent: 1 }, { unit: '<meter>', exponent: 1 }]);
				expect(result.denominator).toEqual([]);
			});

			it("correctly parses a space as a multiplier", function() {
				let result = parser.parse("kg m");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<kilogram>', exponent: 1 }, { unit: '<meter>', exponent: 1 }]);
				expect(result.denominator).toEqual([]);
			});

			it("correctly parses ambigious prefixed unit in a multiplication", function() {
				let result = parser.parse("mm.s");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<meter>', prefix: '<milli>', exponent: 1 }, { unit: '<second>', exponent: 1 }]);
				expect(result.denominator).toEqual([]);
			});

			it("correctly parses a divison", function() {
				let result = parser.parse("m/s");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<meter>', exponent: 1 }]);
				expect(result.denominator).toEqual([{ unit: '<second>', exponent: 1 }]);
			});

			it("correctly parses ambigious prefixed unit in a divison", function() {
				let result = parser.parse("mm/s");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<meter>', prefix: '<milli>', exponent: 1 }]);
				expect(result.denominator).toEqual([{ unit: '<second>', exponent: 1 }]);
			});

			it("correctly parses multiplication and divison", function() {
				let result = parser.parse("kg.m/s");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<kilogram>', exponent: 1 }, { unit: '<meter>', exponent: 1 }]);
				expect(result.denominator).toEqual([{ unit: '<second>', exponent: 1 }]);
			});
		});



		describe("number and unit combination logic", function() {

			it("correctly parses a decimal point multiplier, division and power", function() {
				let result = parser.parse("kg.m/s^2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<kilogram>', exponent: 1 }, { unit: '<meter>', exponent: 1 }]);
				expect(result.denominator).toEqual([{ unit: '<second>', exponent: 2 }]);
			});

			it("correctly parses a float, decimal point multiplier, division and power", function() {
				let result = parser.parse("3.5 kg.m/s^2");

				expect(result.scalar.eq(3.5)).toBe(true);
				expect(result.numerator).toEqual([{ unit: '<kilogram>', exponent: 1 }, { unit: '<meter>', exponent: 1 }]);
				expect(result.denominator).toEqual([{ unit: '<second>', exponent: 2 }]);
			});
		});
	});
})