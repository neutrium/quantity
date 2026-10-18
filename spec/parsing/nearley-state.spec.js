import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const testNumeric = new DecimalScientificAdapter();
import { expect, it, vi } from 'vitest';
import Nearley from 'nearley/lib/nearley.js';
import { NearleyParser } from '../../dist/parsers/NearleyParser.js';
import { UnitTokenManager } from '../../dist/UnitTokenManager.js';

it('compiles once while isolating parser state across instances and failures', () => {
	const compile = vi.spyOn(Nearley.Grammar, 'fromCompiled');
	try {
		const a = new NearleyParser();
		const b = new NearleyParser();
		expect(a.parse('m', testNumeric).numerator).toEqual([{ unit: '<meter>', exponent: 1 }]);
		expect(() => b.parse('???', testNumeric)).toThrow();
		expect(() => b.parse('m/', testNumeric)).toThrow('Expected a complete expression');
		expect(a.parse('2 kg', testNumeric).scalar.toString()).toBe('2');
		expect(b.parse('s', testNumeric).numerator).toEqual([{ unit: '<second>', exponent: 1 }]);
		expect(compile).toHaveBeenCalledTimes(1);
	} finally { compile.mockRestore(); }
});

it('isolates lexer state when a parse is reentered during token resolution', () => {
	const parser = new NearleyParser();
	const manager = UnitTokenManager.instance;
	const original = manager.getUnitToken.bind(manager);
	let entered = false;
	const lookup = vi.spyOn(manager, 'getUnitToken').mockImplementation(value => {
		if (!entered) {
			entered = true;
			expect(parser.parse('2 kg', testNumeric).numerator).toEqual([{ unit: '<kilogram>', exponent: 1 }]);
		}
		return original(value);
	});
	try {
		const result = parser.parse('3 minch*s', testNumeric);
		expect(entered).toBe(true);
		expect(result.scalar.toString()).toBe('3');
		expect(result.numerator).toEqual([{ unit: '<inch>', prefix: '<milli>', exponent: 1 }, { unit: '<second>', exponent: 1 }]);
	} finally { lookup.mockRestore(); }
});
