import { describe, expect, it } from 'vitest';
import { NearleyQtyParser } from '../../dist/parsers/NearleyQtyParser.js'

//
//
//

[
	["NearleyQtyParser Unit Tests", new NearleyQtyParser()],
]
.forEach(([description, parser]) => {

	describe("Neutrium Quantity - Extended "  + description, function() {

		describe("unit parentheses logic", function() {

			it("correctly parses division units to the power of negative two", function() {
				let result = parser.parse("m/s^-2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<meter>', '<second>', '<second>']);
				expect(result.denominator).toEqual(['<1>']);
			});
		});


		describe("unit parentheses logic", function() {
			it("correctly parses multiplication units squared", function() {
				let result = parser.parse("(kg.s)^2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<kilogram>', '<second>', '<kilogram>', '<second>']);
				expect(result.denominator).toEqual(['<1>']);
			});

			it("correctly parses multiplication units to the power of negative two", function() {
				let result = parser.parse("(kg.s)^-2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<1>']);
				expect(result.denominator).toEqual(['<kilogram>', '<second>', '<kilogram>', '<second>']);
			});

			it("correctly parses multiplication units squared times a unit", function() {
				let result = parser.parse("m*(kg.s)^2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<meter>', '<kilogram>', '<second>', '<kilogram>', '<second>']);
				expect(result.denominator).toEqual(['<1>']);
			});

			it("correctly parses multiplication units to the power of negative two times a unit", function() {
				let result = parser.parse("m*(kg.s)^-2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<meter>']);
				expect(result.denominator).toEqual(['<kilogram>', '<second>', '<kilogram>', '<second>']);
			});
		});

		describe("number and unit combination logic", function() {

			it("correctly parses a decimal point multiplier, division and power", function() {
				let result = parser.parse("kg.m/s^2");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<kilogram>', '<meter>']);
				expect(result.denominator).toEqual(['<second>', '<second>']);
			});

			it("correctly parses a float squared, decimal point multiplier, division and power", function() {
				let result = parser.parse("3.5^2 kg.m/s^2");

				expect(result.scalar.eq(12.25)).toBe(true);
				expect(result.numerator).toEqual(['<kilogram>',  '<meter>']);
				expect(result.denominator).toEqual(['<second>', '<second>']);
			});
		});
	});
})