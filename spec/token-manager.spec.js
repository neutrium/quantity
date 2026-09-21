import { describe, expect, it } from 'vitest';
import { UnitTokenManager } from '../dist/UnitTokenManager.js'

describe("Neutrium Quantity Token Manager Tests", function() {
	const tm = UnitTokenManager.instance;

	it("token for 'm' should equal '<meter>'", function() {

		var x = tm.getUnitToken("m");

		expect(x).toEqual("<meter>");
	});

	it("token for 'metre' should equal '<meter>'", function() {

		var x = tm.getUnitToken("metre");

		expect(x).toEqual("<meter>");
	});

	it("should be able to get map from getMap('prefix')", function() {

		var x = tm.getMap('prefix')

		expect(Object.keys(x).length).toBe(100);
	});

});