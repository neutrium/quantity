import { describe, expect, it } from 'vitest';
import { NearleyQtyParser } from '../../dist/parsers/NearleyQtyParser.js'
import { RegexQtyParser } from '../../dist/parsers/RegexQtyParser.js';

//
//	RegexQtyParser cannot do:
//	- numbers to the power i.e. must be a straight up number
//	- parentises


[
	["NearleyQtyParser Unit Tests", new NearleyQtyParser()],
	["RegexQtyParser Unit Tests", new RegexQtyParser()]
]
.forEach(([description, parser]) => {
	describe("Neutrium Quantity - "  + description, function() {

		describe("number parsing logic", function() {
			it("correctly parses an integer", function() {
				let result = parser.parse("1");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual(['<1>']);
				expect(result.denominator).toEqual(['<1>']);
			});

			it("correctly parses a float", function() {
				let result = parser.parse("1.2");

				expect(result.scalar.eq(1.2)).toBe(true);
				expect(result.numerator).toEqual(['<1>']);
				expect(result.denominator).toEqual(['<1>']);
			});

			it("correctly parses a signed float", function() {
				let result = parser.parse("-1.2");

				expect(result.scalar.eq(-1.2)).toBe(true);
			});

			it("correctly parses a signed float with an integer exponent", function() {
				let result = parser.parse("-1.2e2");

				expect(result.scalar.eq(-1.2e2)).toBe(true);
			});

			it("correctly parses a signed float with an negative integer exponent", function() {
				let result = parser.parse("-1.2e-2");

				expect(result.scalar.eq(-1.2e-2)).toBe(true);
			});
		});
	});
})