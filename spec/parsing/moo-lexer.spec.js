import { describe, expect, it } from 'vitest';
import { lexerTemplate } from '../../dist/parsers/MooQtyLexer.js'

describe("Neutrium Quantity MooLexer Tests", function() {
	function tokenize(input) {
		return Array.from(lexerTemplate.clone().reset(input));
	}

	it("token type for '1 m' should be a integer and a unit'", function() {
		let result = tokenize("1 m");

		expect(result.map((x) => x.type)).toEqual(["integer", "ws", "unit"]);
	});

	it("token type for 'metre' should be a unit", function() {
		let result = tokenize("meter");

		expect(result.map((x) => x.type)).toEqual(["unit"]);
	});

	it("token type for 'km' should be a complete prefixed unit", function() {
		let result = tokenize("km");

		expect(result.map((x) => x.type)).toEqual(["unit"]);
		expect(result[0].value).toBe('km');
	});

	it("token for 'km^2' should be a unit, pwr, integer", function() {
		let result = tokenize("km^2");

		expect(result.map((x) => x.type)).toEqual(["unit", "pwr", "integer"]);
	});

	it("token for 'kg.m/s^2' should be a correct", function() {
		let result = tokenize("kg.m/s^2");

		expect(result.map((x) => x.type)).toEqual(["unit", "dot", "unit", "div", "unit", "pwr", "integer"]);
	});


	it("token for '1.3e-2 (kg.m)/s^2' should be a correct", function() {
		let result = tokenize("1.3e-2 (kg.m)/s^2");

		expect(result.map((x) => x.type)).toEqual(["signedFloat", "ws", "lParen", "unit", "dot", "unit", "rParen", "div", "unit", "pwr", "integer"]);
	});

});
