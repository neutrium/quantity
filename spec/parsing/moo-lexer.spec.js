import { describe, expect, it } from 'vitest';
import { MooQtyLexer } from '../../dist/parsers/MooQtyLexer.js'

describe("Neutrium Quantity MooLexer Tests", function() {
	let lexer = new MooQtyLexer();

	it("token type for '1 m' should be a integer and a unit'", function() {
		let result = lexer.tokenize("1 m");

		expect(result.map((x) => x.type)).toEqual(["integer", "ws", "unit"]);
	});

	it("token type for 'metre' should be a unit", function() {
		let result = lexer.tokenize("meter");

		expect(result.map((x) => x.type)).toEqual(["unit"]);
	});

	it("token type for 'km' should be a unit and a unit", function() {
		let result = lexer.tokenize("km");

		expect(result.map((x) => x.type)).toEqual(["unit", "unit"]);
	});

	it("token for 'km^2' should be a unit, unit, pwr, integer", function() {
		let result = lexer.tokenize("km^2");

		expect(result.map((x) => x.type)).toEqual(["unit", "unit", "pwr", "integer"]);
	});

	it("token for 'kg.m/s^2' should be a correct", function() {
		let result = lexer.tokenize("kg.m/s^2");

		expect(result.map((x) => x.type)).toEqual(["unit", "mul", "unit", "div", "unit", "pwr", "integer"]);
	});


	it("token for '1.3e-2 (kg.m)/s^2' should be a correct", function() {
		let result = lexer.tokenize("1.3e-2 (kg.m)/s^2");

		expect(result.map((x) => x.type)).toEqual(["signedFloat", "ws", "lParen", "unit", "mul", "unit", "rParen", "div", "unit", "pwr", "integer"]);
	});

});