import { expect, it, vi } from 'vitest';
import Nearley from 'nearley/lib/nearley.js';
import { NearleyQtyParser } from '../../dist/parsers/NearleyQtyParser.js';
import { UnitTokenManager } from '../../dist/UnitTokenManager.js';

it('compiles once while isolating parser state across instances and failures', () => {
	const compile = vi.spyOn(Nearley.Grammar, 'fromCompiled');
	try {
		const a = new NearleyQtyParser();
		const b = new NearleyQtyParser();
		expect(a.parse('m').numerator).toEqual([{ unit: '<meter>', exponent: 1 }]);
		expect(() => b.parse('???')).toThrow();
		expect(() => b.parse('m/')).toThrow('Expected a complete expression');
		expect(a.parse('2 kg').scalar.toString()).toBe('2');
		expect(b.parse('s').numerator).toEqual([{ unit: '<second>', exponent: 1 }]);
		expect(compile).toHaveBeenCalledTimes(1);
	} finally { compile.mockRestore(); }
});

it('isolates lexer state when a parse is reentered during token resolution', () => {
	const parser = new NearleyQtyParser();
	const manager = UnitTokenManager.instance;
	const original = manager.getUnitToken.bind(manager);
	let entered = false;
	const lookup = vi.spyOn(manager, 'getUnitToken').mockImplementation(value => {
		if (!entered) {
			entered = true;
			expect(parser.parse('2 kg').numerator).toEqual([{ unit: '<kilogram>', exponent: 1 }]);
		}
		return original(value);
	});
	try {
		const result = parser.parse('3 minch*s');
		expect(entered).toBe(true);
		expect(result.scalar.toString()).toBe('3');
		expect(result.numerator).toEqual([{ unit: '<inch>', prefix: '<milli>', exponent: 1 }, { unit: '<second>', exponent: 1 }]);
	} finally { lookup.mockRestore(); }
});
