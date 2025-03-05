import { NearleyQtyParser } from '../../dist/parsers/NearleyQtyParser.js'

[
	["NearleyQtyParser Unit Tests", new NearleyQtyParser()],
]
.forEach(([description, parser]) => {
	describe("Neutrium Quantity - "  + description, function() {

		describe("number to the power parsing logic", function() {

			it("correctly parses a signed float to the power of an integer", function() {
				let result = parser.parse("2.5^2");

				expect(result.scalar.eq(6.25)).toBe(true);
			});

			it("correctly parses a integer to the power of an float", function() {
				let result = parser.parse("4^0.5");

				expect(result.scalar.eq(2)).toBe(true);
			});

			it("correctly parses an integer to the power of a signed integer", function() {
				let result = parser.parse("4^-2");

				expect(result.scalar.eq(0.0625)).toBe(true);
			});
		});
	});
})