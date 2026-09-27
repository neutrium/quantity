import { describe, expect, it } from 'vitest';
import { Quantity } from '@neutrium/quantity';
import { calculate, CalculationError, errorMessage, formatQuantity, presets } from '../src/calculations.ts';

describe('Quantity demo', () => {
	it.each([
		['1 unknownunit', 'to', 'ft', 'value', 'Quantity, column'],
		['1 m', 'to', 'unknownunit', 'operand', 'Target units, column'],
		['1 m', 'add', '2 unknownunit', 'operand', 'Second quantity, column'],
		['1 m/', 'to', 'ft', 'value', 'Quantity, column'],
		['1 m', 'mul', '2 (', 'operand', 'Second quantity, column'],
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

	it('uses isolated precision and rounding settings in calculations and generated code', () => {
		for (const rounding of ['half-up', 'half-even']) {
			const options = { value: '2.5 m', operation: 'div', operand: '2', precision: 2, rounding };
			const calculation = calculate(options);
			expect(calculation.output).toBe(rounding === 'half-up' ? '1.3 m' : '1.2 m');
			const run = new Function('Quantity', calculation.code.replace(/^import[^\n]+\n/, '') + '\nreturn result;');
			expect(formatQuantity(run(Quantity))).toBe(calculation.output);
		}
		expect(calculate({ value: '1 m', operation: 'div', operand: '3', precision: 5 }).output).toBe('0.33333 m');
		expect(calculate({ value: '1 m', operation: 'div', operand: '3', precision: 30 }).output).toBe('0.333333333333333333333333333333 m');
		expect(() => calculate({ value: '1 m', operation: 'to', operand: 'cm', precision: 0 })).toThrow('significant digits');
	});

	it('uses structured parse error codes for arithmetic and exponent failures', () => {
		for (const [value, message] of [['1/0 m', 'divide by zero'], ['m^9007199254740992', 'safe integers']]) {
			try { calculate({ value, operation: 'toBase', operand: '' }); throw new Error('Expected failure'); }
			catch (error) { expect(errorMessage(error)).toContain(message); }
		}
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
		['1 m', 'inverse', '', '1/m'],
		['2 s', 'inverse', '', '0.5/s'],
		['0.5 m', 'inverse', '', '2/m'],
		['-1 m', 'inverse', '', '-1/m'],
		['1 m*s', 'inverse', '', '1/m.s'],
		['100 cm', 'toBase', '', '1 m'],
		['1000 cm', 'to', '2 m', '10 m'],
		['0 tempC', 'to', '-300 tempC', '0 tempC'],
		['1/2 m', 'to', 'cm', '50 cm'],
		['2 kg/(m*s)', 'toBase', '', '2 kg/m.s'],
		['1 m', 'pow', '13', '1 m13'],
		['1 m', 'eq', '2 m', 'false'],
		['1 m', 'isCompatible', '2 s', 'false'],
	])('calculates %s %s %s', (value, operation, operand, output) => {
		expect(calculate({ value, operation, operand }).output).toBe(output);
	});

	it('formats reciprocal base values without changing the units in generated code', () => {
		const result = calculate({ value: '1 m', operation: 'inverse', operand: '' });
		expect(result.base).toBe('1/m');
		expect(result.units).toBe('1/m');
		expect(result.code).toContain('result.scalar.toString(); // "1"');
		expect(result.code).toContain('result.units(); // "1/m"');
		expect(formatQuantity(new Quantity('1'))).toBe('1');
		expect(formatQuantity(new Quantity('1 m'))).toBe('1 m');
	});

	it.each([
		['', 'to', 'm'],
		['1 m', 'to', ''],
		['1 m', 'to', 's'],
		['100 tempC', 'add', '50 tempC'],
		['1 m', 'pow', '0.5'],
		['1 m', 'pow', '9007199254740992'],
		['1 m', 'pow', 'NaN'],
	])('rejects invalid calculation %s %s %s', (value, operation, operand) => {
		expect(() => calculate({ value, operation, operand })).toThrow();
	});
});
