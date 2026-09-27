import { expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { compareSum, roundSum } from '../dist/operations/exact-sum.js';

it('matches an independent expanded rational reference across signs, scales, ties, and rounding modes', () => {
	const modes = ['up', 'down', 'ceil', 'floor', 'half-up', 'half-down', 'half-even', 'half-ceil', 'half-floor'];
	let state = 419;
	const random = n => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
	for (const rounding of modes) for (const precision of [1, 3, 20]) {
		const Reference = Decimal.clone({ precision, rounding });
		for (let i = 0; i < 80; i++) {
			const terms = Array.from({ length: 4 }, () => ({ numerator: BigInt(random(20001) - 10000),
				denominator: BigInt(random(9) + 1), exponent: BigInt(random(201) - 100) }));
			const exponent = terms.reduce((a, b) => a < b.exponent ? a : b.exponent, terms[0].exponent);
			const denominator = terms.reduce((a, b) => a * b.denominator, 1n);
			const numerator = terms.reduce((a, b) => a + b.numerator * (denominator / b.denominator)
				* 10n ** (b.exponent - exponent), 0n);
			const expected = new Reference(`${numerator}e${exponent}`).div(denominator);
			expect(roundSum(terms, Reference).toString()).toBe(expected.toString());
			expect(compareSum(terms)).toBe(numerator < 0n ? -1 : numerator > 0n ? 1 : 0);
		}
	}
});

it('cancels large terms before rounding a distant signed tail', () => {
	const terms = [{ numerator: 32n, denominator: 1n, exponent: 0n },
		{ numerator: 18n, denominator: 10n, exponent: -9000000000000000n },
		{ numerator: -32n, denominator: 1n, exponent: 0n }];
	expect(compareSum(terms)).toBe(1);
	expect(roundSum(terms, Decimal).toString()).toBe('1.8e-9000000000000000');
});

it('keeps terminating results compact at high precision, including cancellation and reducible ratios', () => {
	const Output = Decimal.clone({ precision: 100000, maxOutputDigits: 30 });
	for (const [numerator, denominator, expected] of [[100n, 1n, '100'], [1n, 8n, '0.125'],
		[-99n, 40n, '-2.475'], [6n, 15n, '0.4']]) {
		const result = roundSum([{ numerator, denominator, exponent: 0n }], Output);
		expect(result.toString()).toBe(expected);
		expect(result.constructor).toBe(Output);
	}
	expect(roundSum([{ numerator: 100000n, denominator: 3n, exponent: 0n },
		{ numerator: -99997n, denominator: 3n, exponent: 0n }], Output).toString()).toBe('1');
});

it('rounds single rational results correctly for every mode and preserves distant tails', () => {
	const modes = ['up', 'down', 'ceil', 'floor', 'half-up', 'half-down', 'half-even', 'half-ceil', 'half-floor'];
	for (const rounding of modes) for (const precision of [1, 3, 20]) {
		const Output = Decimal.clone({ precision, rounding });
		for (const numerator of [-9995n, -1n, 1n, 9995n]) for (const denominator of [1n, 8n, 40n, 3n, 99n]) {
			const expected = new Output(numerator).div(denominator);
			expect(roundSum([{ numerator, denominator, exponent: 0n }], Output).toString()).toBe(expected.toString());
		}
		const tail = new Decimal('1e-5000');
		for (const numerator of [-1n, 1n]) {
			const expected = new Output('1.005').add(numerator < 0n ? tail.neg() : tail);
			const terms = [{ numerator: 1005n, denominator: 1n, exponent: -3n },
				{ numerator, denominator: 1n, exponent: -5000n }];
			expect(roundSum(terms, Output).toString()).toBe(expected.toString());
		}
	}
});

it('applies output range after rational rounding and external exponent cancellation', () => {
	const Output = Decimal.clone({ precision: 3, rounding: 'half-up', minE: -6, maxE: 6, maxOutputDigits: 20 });
	expect(roundSum([{ numerator: 9995n, denominator: 1n, exponent: -10n }], Output).toString()).toBe('0.000001');
	expect(roundSum([{ numerator: 10n ** 1000n, denominator: 1n, exponent: -1000n }], Output).toString()).toBe('1');
	expect(roundSum([{ numerator: 1n, denominator: 10n ** 1000n, exponent: 1000n }], Output).toString()).toBe('1');
	expect(roundSum([{ numerator: -1n, denominator: 8n, exponent: -6n }], Output).isNeg()).toBe(true);
	expect(roundSum([{ numerator: -1n, denominator: 8n, exponent: -6n }], Output).isZero()).toBe(true);
	expect(roundSum([{ numerator: 9995n, denominator: 1n, exponent: 3n }], Output).toString()).toBe('Infinity');
	const Wide = Decimal.clone({ precision: 3 });
	expect(roundSum([{ numerator: 8n, denominator: 8n, exponent: -9000000000000000n }], Wide).toString())
		.toBe('1e-9000000000000000');
});
