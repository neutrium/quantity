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
				expect(x.numerator).toEqual(['<meter>']);
				expect(x.denominator).toEqual(['<1>']);
			});

			it("correctly parses a unit", function() {
				let result = parser.parse("metre");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<meter>']);
				expect(result.denominator).toEqual(['<1>']);
			});

			it("correctly parses a prefixed unit", function() {
				let result = parser.parse("km");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<kilo>', '<meter>']);
				expect(result.denominator).toEqual(['<1>']);
			});

			it("correctly parses an ambigious prefixed unit", function() {
				let result = parser.parse("mm");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<milli>', '<meter>']);
				expect(result.denominator).toEqual(['<1>']);
			});

			it("correctly parses a unit with parenthesis in the name", function() {
				let result = parser.parse("ton(l)");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<ton-long>']);
				expect(result.denominator).toEqual(['<1>']);
			});
		});

		describe("unit to the power logic", function() {

			it("correctly parses a unit squared", function() {
				let result = parser.parse("m^2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<meter>', '<meter>']);
				expect(result.denominator).toEqual(['<1>']);
			});

			it("correctly parses a unit squared without a ^", function() {
				let result = parser.parse("m2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<meter>', '<meter>']);
				expect(result.denominator).toEqual(['<1>']);
			});

			it("correctly parses a unit to the power of a negative integer", function() {
				let result = parser.parse("m^-2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<1>']);
				expect(result.denominator).toEqual(['<meter>', '<meter>']);
			});

			it("correctly parses a prefixed unit squared", function() {
				let result = parser.parse("km^2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<kilo>', '<meter>', '<kilo>', '<meter>']);
				expect(result.denominator).toEqual(['<1>']);
			});

			it("correctly parses division units to the power of two", function() {
				let result = parser.parse("m/s^2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<meter>']);
				expect(result.denominator).toEqual(['<second>', '<second>']);
			});
		});

		describe("unit multiplication and division logic", function() {

			it("correctly parses a decimal point as a multiplier", function() {
				let result = parser.parse("kg.m");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<kilogram>', '<meter>']);
				expect(result.denominator).toEqual(['<1>']);
			});

			it("correctly parses a * as a multiplier", function() {
				let result = parser.parse("kg*m");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<kilogram>', '<meter>']);
				expect(result.denominator).toEqual(['<1>']);
			});

			it("correctly parses a space as a multiplier", function() {
				let result = parser.parse("kg m");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<kilogram>', '<meter>']);
				expect(result.denominator).toEqual(['<1>']);
			});

			it("correctly parses ambigious prefixed unit in a multiplication", function() {
				let result = parser.parse("mm.s");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<milli>','<meter>', '<second>']);
				expect(result.denominator).toEqual(['<1>']);
			});

			it("correctly parses a divison", function() {
				let result = parser.parse("m/s");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<meter>']);
				expect(result.denominator).toEqual(['<second>']);
			});

			it("correctly parses ambigious prefixed unit in a divison", function() {
				let result = parser.parse("mm/s");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<milli>','<meter>']);
				expect(result.denominator).toEqual(['<second>']);
			});

			it("correctly parses multiplication and divison", function() {
				let result = parser.parse("kg.m/s");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<kilogram>','<meter>']);
				expect(result.denominator).toEqual(['<second>']);
			});
		});



		describe("number and unit combination logic", function() {

			it("correctly parses a decimal point multiplier, division and power", function() {
				let result = parser.parse("kg.m/s^2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<kilogram>', '<meter>']);
				expect(result.denominator).toEqual(['<second>', '<second>']);
			});

			it("correctly parses a float, decimal point multiplier, division and power", function() {
				let result = parser.parse("3.5 kg.m/s^2");

				expect(result.scalar.eq(3.5)).toBe(true);
				expect(result.numerator).toEqual(['<kilogram>',  '<meter>']);
				expect(result.denominator).toEqual(['<second>', '<second>']);
			});
		});
	});
})