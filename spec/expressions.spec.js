import { describe, expect, it } from 'vitest';
import { Quantity } from '@neutrium/quantity';
import { Quantity as NumberQuantity } from '@neutrium/quantity/number';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { createQuantityEvaluator, ExpressionError } from '@neutrium/quantity/expressions';

for (const Q of [Quantity, NumberQuantity, RegexQuantity])
{
	describe(`quantity evaluator (${Q === NumberQuantity ? 'number' : Q === RegexQuantity ? 'regex preset' : 'Decimal'})`, () => {
		const e = createQuantityEvaluator({ Quantity: Q });
		it.each([
			['2 m/s * 1 kg + 4 kg.m/s', '6 kg*m/s'], ['2 m + 30 cm', '2.3 m'],
			['2m-30cm', '1.7 m'], ['2 m - -30 cm', '2.3 m'], ['(2 m + 30 cm) / 2 s', '1.15 m/s'],
			['2 kg*m/s^2', '2 N'], ['sqrt(4 m^2)', '2 m'], ['cbrt(-8 m^3)', '-2 m'],
			['(2 m)^2', '4 m2'], ['2 m^2', '2 m2'], ['m^2^3', '1 m8'], ['(8 m3)^(1/3)', '2 m'], ['m^(1/3)', 'm^(1/3)'], ['pow(8 m3, 1/3)', '2 m'],
			['1. + 2', '3'], ['(2 m)^(200 cm/m)', '4 m2'],
			['2 m² + 3 m2', '5 m2'], ['2 cm^(1/2) + 3 cm^(1/2)', '5 cm^(1/2)'],
			['2 min + 30 s', '2.5 min'], ['2 ton(l) + 1 ton(l)', '3 ton(l)'],
			['1eV + 2eV', '3 eV'], ['1Em + 2Em', '3 Em'], ['2 minch + 3 minch', '5 minch'],
			['1/2 m', '0.5 m'], ['(1/2) m', '0.5 m'], ['1/(2 m)', '0.5/m'],
			['1/2m', '0.5/m'], ['1 / 2\tm', '0.5 m'], ['-1/2 m', '-0.5 m'],
			['1 / -2 m', '-0.5 m'], ['1.5/3e0 m', '0.5 m'], ['1/2/4 m', '0.125 m'],
			['1/2 m^2', '0.5 m2'], ['1/2 m/s', '0.5 m/s'], ['1/2 kg.m/s', '0.5 kg*m/s'],
			['1/2 m + 25 cm', '0.75 m'], ['1 m - 1/2 m', '0.5 m'], ['sqrt(1/4 m2)', '0.5 m'],
			['1/2 + 1/4', '0.75'], ['1/2/4', '0.125'], ['2 m / 4 s', '0.5 m/s'],
			['kg/m.s', '1 kg/m.s'],
			['2 (m/s)^2', '2 m2/s2'], ['abs(-2 m)', '2 m'], ['min(2 m, 30 cm)', '30 cm'],
			['max(2 m, 30 cm)', '2 m'], ['pow(2 m, 3)', '8 m3'], ['5 m % 200 cm', '1 m'],
			['2^3^2', '512'], ['-2^2', '-4'], ['(-2)^2', '4'], ['2×3 m + 1 m', '7 m'],
		])('evaluates %s as %s', (source, expected) => {
			const result = e.evaluate(source);
			expect(result).toBeInstanceOf(Q);
			expect(result.eq(new Q(expected))).toBe(true);
			expect(e.compile(source).evaluate().eq(result)).toBe(true);
		});
		it('compiles variables once and converts bindings to the configured backend', () => {
			const f = e.compile('mass * velocity + offset');
			expect(f.variables).toEqual(['mass', 'velocity', 'offset']);
			for (const n of [1, 2, 3]) {
				const result = f.evaluate({ mass: new Quantity(`${n} kg`), velocity: new NumberQuantity('2 m/s'), offset: new Q('4 kg*m/s') });
				expect(result.eq(`${2*n+4} kg*m/s`)).toBe(true);
			}
		});
		it('uses Quantity temperature semantics and validates signed readings', () => {
			expect(e.evaluate('-20 tempC + 10 degC').eq('-10 tempC')).toBe(true);
			expect(e.evaluate('20 tempC - 10 tempC').eq('10 degC')).toBe(true);
			for (const source of ['20 tempC + 10 tempC', '20 tempC * 2 m', '-300 tempC', '-(20 tempC)'])
				expect(e.tryEvaluate(source).status, source).toBe('error');
		});
		it('rejects zero denominators in fractional quantity literals', () => {
			expect(e.tryEvaluate('1/0 m').status).toBe('error');
			expect(() => e.compile('1/0 m')).toThrow(ExpressionError);
		});
		it.each([
			['2 m + 3 s', 'DOMAIN_ERROR', 4], ['2 m / 0 s', 'DIVISION_BY_ZERO', 4],
			['2 m ^ (2 s)', 'DOMAIN_ERROR', 4], ['sqrt(-4 m2)', 'DOMAIN_ERROR', 0],
			['min(1 m, 2 s)', 'DOMAIN_ERROR', 0], ['unknown + 2 m', 'UNKNOWN_VARIABLE', 0],
		])('reports %s at the operator/call', (source, code, start) => {
			const result = e.tryEvaluate(source);
			expect(result).toMatchObject({ status: 'error', error: { code, start } });
			expect(result.error).toBeInstanceOf(ExpressionError);
		});
		it.each(['2 m +', '(2 m', 'sqrt(', '2 m/'])('recognizes incomplete %s', source => {
			expect(e.tryEvaluate(source).status).toBe('incomplete');
		});
	});
}

it('honors Decimal precision, exact exponent text and a configured class', () => {
	const Q = Quantity.withConfig({ numeric: { precision: 40 }, cache: false });
	const e = createQuantityEvaluator({ Quantity: Q });
	const result = e.evaluate('1 m / 3 + 1 m / 7');
	expect(result.scalar.toString()).toBe(new Q('1 m').div(3).add(new Q('1 m').div(7)).scalar.toString());
	expect(result.config).toBe(Q.config);
	expect(e.evaluate('123456789012345678901 m + 1 m').scalar.toString()).toBe('123456789012345678902');
	const Narrow = Quantity.withConfig({ numeric: { minE: -10 } });
	const evaluator = createQuantityEvaluator({ Quantity: Narrow });
	expect(evaluator.evaluate('(1 m)^1e-20').numerator[0].exponent).toEqual({ numerator: 1n, denominator: 100000000000000000000n });
});

it('supports custom functions and constants, with safe bindings and bounded input', () => {
	const e = createQuantityEvaluator({ Quantity, constants: { gravity: new Quantity('9.81 m/s2') }, functions: {
		double: { minArgs: 1, evaluate: ([a]) => a.mul(2) },
	} });
	expect(e.evaluate('double(2 kg) * gravity').eq('39.24 N')).toBe(true);
	expect(e.functions.find(f => f.name === 'sqrt')).toMatchObject({ origin: 'builtin' });
	expect(e.functions.find(f => f.name === 'min').maxArgs).toBeLessThan(Number.MAX_SAFE_INTEGER);
	expect(e.compile('mass').tryEvaluate({ get mass() { throw new Error('getter must not run'); } })).toMatchObject({ status: 'error', error: { code: 'INVALID_BINDING' } });
	expect(e.evaluate('count + 1', { count: '1.' }).scalar.toString()).toBe('2');
	expect(e.tryEvaluate('mass', { mass: '2 kg' })).toMatchObject({ status: 'error', error: { code: 'INVALID_BINDING' } });
	const limited = createQuantityEvaluator({ Quantity, limits: { maxTokens: 3, maxLength: 30, maxDepth: 4 } });
	for (const source of ['1 m+2 m+3 m', '('.repeat(5)+'m'+')'.repeat(5), '1'.repeat(31)])
		expect(limited.tryEvaluate(source)).toMatchObject({ status: 'error', error: { code: 'LIMIT_EXCEEDED' } });
});

it('rejects options accessors and unknown syntax settings without running getters', () => {
	let called = false;
	expect(() => createQuantityEvaluator({ get Quantity() { called = true; return Quantity; } })).toThrow(ExpressionError);
	expect(called).toBe(false);
	expect(() => createQuantityEvaluator({ Quantity, syntax: {} })).toThrow(ExpressionError);
	expect(() => createQuantityEvaluator({ Quantity, constants: { g: 9.81 } })).toThrow(/Unit name/);
});
