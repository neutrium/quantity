import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const testNumeric = new DecimalScientificAdapter();
import { describe, expect, it } from 'vitest';
import { NearleyParser } from '../../dist/parsers/NearleyParser.js'

[
	["NearleyParser Unit Tests", new NearleyParser()],
]
.forEach(([description, parser]) => {
	describe("Neutrium Quantity - "  + description, function() {

		describe("number to the power parsing logic", function() {

			it("correctly parses a signed float to the power of an integer", function() {
				let result = parser.parse("2.5^2", testNumeric);

				expect(result.scalar.eq(6.25)).toBe(true);
			});

			it("correctly parses a integer to the power of an float", function() {
				let result = parser.parse("4^0.5", testNumeric);

				expect(result.scalar.eq(2)).toBe(true);
			});

			it("correctly parses an integer to the power of a signed integer", function() {
				let result = parser.parse("4^-2", testNumeric);

				expect(result.scalar.eq(0.0625)).toBe(true);
			});
		});
	});
})
