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
			it.each([
				['+1', '1'],
				['+0', '0'],
				['+1.25', '1.25'],
				['+.5', '0.5'],
				['+1.2e+3', '1200'],
				['+1.2E-3', '0.0012'],
				['+1.2345678901234567890123456789', '1.2345678901234567890123456789'],
			])('parses a leading positive sign in %s with and without units', (input, expected) => {
				for (const suffix of ['', ' m']) {
					for (let repeat = 0; repeat < 2; repeat++) {
						const result = parser.parse(input + suffix);
						expect(result.scalar.toString()).toBe(expected);
						expect(result.numerator).toEqual(suffix ? [{ unit: '<meter>', exponent: 1 }] : []);
						expect(result.denominator).toEqual([]);
					}
				}
			});

			it('keeps negative signs and rejects malformed sign sequences', () => {
				expect(parser.parse('-0 m').scalar.isNeg()).toBe(true);
				for (const input of ['++1 m', '+-1 m', '-+1 m', '+m', '+', '+1e+ m']) {
					expect(() => parser.parse(input), input).toThrow();
				}
			});

			it("correctly parses an integer", function() {
				let result = parser.parse("1");

				expect(result.scalar.eq(1)).toBe(true);
				expect(result.numerator).toEqual([]);
				expect(result.denominator).toEqual([]);
			});

			it("correctly parses a float", function() {
				let result = parser.parse("1.2");

				expect(result.scalar.eq(1.2)).toBe(true);
				expect(result.numerator).toEqual([]);
				expect(result.denominator).toEqual([]);
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
