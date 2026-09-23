import { describe, expect, it } from 'vitest';
import { Quantity } from '@neutrium/quantity';
import { calculate, CalculationError, errorMessage, formatQuantity, presets } from '../src/calculations.ts';

describe('Quantity demo', () => {
	it.each([
		['1 unknownunit', 'to', 'ft', 'value', 'Quantity not recognised.'],
		['1 m', 'to', 'unknownunit', 'operand', 'Target units not recognised.'],
		['1 m', 'add', '2 unknownunit', 'operand', 'Second quantity not recognised.'],
		['1 m/', 'to', 'ft', 'value', 'Quantity not recognised.'],
		['1 m', 'mul', '2 (', 'operand', 'Second quantity not recognised.'],
	])('explains invalid expression %s %s %s without parser diagnostics', (value, operation, operand, field, message) => {
		let error;
		try { calculate({ value, operation, operand }); } catch (caught) { error = caught; }
		expect(error).toBeInstanceOf(CalculationError);
		expect(error.field).toBe(field);
		expect(errorMessage(error)).toContain(message);
		expect(errorMessage(error).length).toBeLessThan(150);
		expect(errorMessage(error)).not.toMatch(/Syntax error|Unexpected|Instead, I was expecting|\n/);
	});

	it('preserves actionable temperature validation and hides unexpected internal errors', () => {
		expect(() => calculate({ value: '-300 tempC', operation: 'to', operand: 'tempF' })).toThrow('below absolute zero');
		expect(errorMessage(new Error('Incompatible units'))).toContain('same dimension');
		expect(errorMessage(new Error('Syntax error at line 1\nverbose grammar details'))).toBe('Unable to calculate this expression. Check the quantities, units, and operation.');
	});

	it.each(presets)('$label produces runnable code matching the displayed result', preset => {
		const calculation = calculate(preset);
		const run = new Function('Quantity', calculation.code.replace(/^import[^\n]+\n/, '') + '\nreturn result;');
		const result = run(Quantity);
		expect(typeof result === 'boolean' ? String(result) : formatQuantity(result)).toBe(calculation.output);
	});

	it.each([
		['100 tempC', 'to', 'tempF', '212 tempF'],
		['10 degC', 'to', 'degF', '18 degF'],
		['100 tempC', 'sub', '50 tempC', '50 degC'],
		['1 m', 'add', '25 cm', '1.25 m'],
		['150 km', 'div', '2 h', '75 km/h'],
		['3 m', 'pow', '2', '9 m2'],
		['2 s', 'inverse', '', '0.5 1/s'],
		['100 cm', 'toBase', '', '1 m'],
		['1 m', 'eq', '2 m', 'false'],
		['1 m', 'isCompatible', '2 s', 'false'],
	])('calculates %s %s %s', (value, operation, operand, output) => {
		expect(calculate({ value, operation, operand }).output).toBe(output);
	});

	it.each([
		['', 'to', 'm'],
		['1 m', 'to', ''],
		['1 m', 'to', 's'],
		['100 tempC', 'add', '50 tempC'],
		['1 m', 'pow', '0.5'],
		['1 m', 'pow', '13'],
		['1 m', 'pow', 'NaN'],
	])('rejects invalid calculation %s %s %s', (value, operation, operand) => {
		expect(() => calculate({ value, operation, operand })).toThrow();
	});
});
