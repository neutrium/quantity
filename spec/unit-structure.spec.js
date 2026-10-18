import { describe, expect, it } from 'vitest';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { Quantity as NumberQuantity } from '@neutrium/quantity/number';
import { cancelPowers, combinePowers, normalizePowers, scalePowers } from '../dist/operations/unit-powers.js';

describe('scaling normalized unit powers', () => {
	it('preserves prefixes and order, owns changed records and freezes the result', () => {
		const input = normalizePowers([
			{ unit: '<meter>', prefix: '<kilo>', exponent: 2 },
			{ unit: '<second>', exponent: 1 }, { unit: '<meter>', exponent: 3 },
		]);
		const result = scalePowers(input, 3);
		expect(result).toEqual([
			{ unit: '<meter>', prefix: '<kilo>', exponent: 6 },
			{ unit: '<second>', exponent: 3 }, { unit: '<meter>', exponent: 9 },
		]);
		expect(input.map(term => term.exponent)).toEqual([2, 1, 3]);
		expect(Object.isFrozen(result)).toBe(true);
		result.forEach((term, i) => {
			expect(Object.isFrozen(term)).toBe(true);
			expect(term).not.toBe(input[i]);
		});
		expect(normalizePowers(result)).toBe(result);
	});

	it('still validates and coalesces frozen external arrays', () => {
		const input = Object.freeze([
			Object.freeze({ unit: '<meter>', exponent: 2 }),
			Object.freeze({ unit: '<meter>', exponent: 3 }),
		]);
		expect(scalePowers(input, 2)).toEqual([{ unit: '<meter>', exponent: 10 }]);
		for (const term of [
			{ unit: '<unknown>', exponent: 1 },
			{ unit: '<meter>', prefix: '<second>', exponent: 1 },
			{ unit: '<meter>', exponent: 0 },
			{ unit: '<meter>', exponent: -1 },
		])
		{
			expect(() => scalePowers(Object.freeze([Object.freeze(term)]), 2)).toThrow();
		}
	});

	it('checks powered and summed counts before they can overflow or disappear', () => {
		const max = Number.MAX_SAFE_INTEGER;
		const input = normalizePowers([{ unit: '<meter>', exponent: max }]);
		expect(scalePowers(input, 1)).toBe(input);
		expect(scalePowers(input, 0)).toEqual([]);
		expect(() => scalePowers(input, 2)).toThrow('safe integer');
		expect(() => scalePowers([
			{ unit: '<meter>', exponent: (max - 1) / 2 }, { unit: '<meter>', exponent: 1 },
		], 2)).toThrow('safe integer');
		expect(() => scalePowers([{ unit: '<1>', exponent: max }], 2)).toThrow('safe integer');

		for (const multiplier of [-1, 0.5, Infinity, NaN, max + 1])
		{
			expect(() => scalePowers(input, multiplier)).toThrow();
		}
	});

	for (const [name, Base] of [['Decimal', Quantity], ['number', NumberQuantity]]) {
		it.each([true, false])(`retains power cancellation and grouping for ${name}, cache=%s`, cache => {
			const Q = Base.withConfig({ cache });
			const input = new Q('2 km*m/s/m');
			expect(input.pow(2).units()).toBe('km2/s2');
			expect(input.pow(-2).units()).toBe('s2/km2');
			expect(input.pow(-2).scalar.toString()).toBe('0.25');
			const grouped = new Q('((km/s)^2)^3');
			expect(grouped.units()).toBe('km6/s6');
			expect(input.units()).toBe('km*m/s.m');
		});
	}
});

describe('combining unit structures', () => {
	for (const [name, Base] of [['Decimal', Quantity], ['number', NumberQuantity]]) {
		it.each([true, false])(`shares immutable product units with ${name}, cache=%s`, cache => {
			const Q = Base.withConfig({ cache });
			const speed = new Q('2 m/s'), mass = new Q('3 kg');
			const result = speed.mul(mass);
			expect(result.scalar.toString()).toBe('6');
			expect(result.units()).toBe('m*kg/s');
			expect(result.denominator).toBe(speed.denominator);
			expect(result.numerator[0]).toBe(speed.numerator[0]);
			expect(result.numerator[1]).toBe(mass.numerator[0]);
			expect(Object.isFrozen(result.numerator)).toBe(true);
			expect(Object.isFrozen(result.numerator[0])).toBe(true);
		});
	}

	it('merges exponents without changing operands or conflating prefixes', () => {
		const left = { numerator: normalizePowers([
			{ unit: '<meter>', exponent: 2 }, { unit: '<second>', exponent: 1 },
		]), denominator: [] };
		const right = { numerator: normalizePowers([
			{ unit: '<meter>', exponent: 3 }, { unit: '<meter>', prefix: '<kilo>', exponent: 1 },
		]), denominator: [] };
		const [num, den] = combinePowers(left, right, false);
		expect(num).toEqual([
			{ unit: '<meter>', exponent: 5 }, { unit: '<second>', exponent: 1 },
			{ unit: '<meter>', prefix: '<kilo>', exponent: 1 },
		]);
		expect(den).toEqual([]);
		expect(left.numerator[0].exponent).toBe(2);
		expect(right.numerator[0].exponent).toBe(3);
		expect(Object.isFrozen(num[0])).toBe(true);
	});

	it('swaps divisor sides and cancels units while preserving residual order', () => {
		const [num, den] = combinePowers({ numerator: [
			{ unit: '<meter>', exponent: 2 }, { unit: '<kilogram>', exponent: 1 },
		], denominator: [{ unit: '<second>', exponent: 3 }] }, {
			numerator: [{ unit: '<meter>', exponent: 3 }],
			denominator: [{ unit: '<second>', exponent: 1 }],
		}, true);
		expect(num).toEqual([{ unit: '<kilogram>', exponent: 1 }]);
		expect(den).toEqual([{ unit: '<meter>', exponent: 1 }, { unit: '<second>', exponent: 2 }]);
	});

	it.each([false, true])('rejects same-side overflow before cancellation, divide=%s', divide => {
		const m = exponent => ({ unit: '<meter>', exponent });
		const left = { numerator: [m(Number.MAX_SAFE_INTEGER)], denominator: [m(Number.MAX_SAFE_INTEGER)] };
		const right = { numerator: [m(1)], denominator: [m(1)] };
		expect(() => combinePowers(left, right, divide)).toThrow('safe integer');
		expect(() => combinePowers({ numerator: [], denominator: left.denominator }, {
			numerator: divide ? right.denominator : [], denominator: divide ? [] : right.denominator,
		}, divide)).toThrow('safe integer');
	});

	it('validates and owns external records even when an empty side is reused', () => {
		const external = [{ unit: '<meter>', exponent: 1 }];
		const empty = { numerator: [], denominator: [] };
		const [num] = combinePowers(empty, { numerator: external, denominator: [] }, false);
		external[0].exponent = 2;
		expect(num).toEqual([{ unit: '<meter>', exponent: 1 }]);
		expect(Object.isFrozen(num)).toBe(true);
		expect(Object.isFrozen(num[0])).toBe(true);
		for (const term of [{ unit: '<unknown>', exponent: 1 }, { unit: '<meter>', exponent: 0 }]) {
			expect(() => combinePowers(empty, { numerator: [term], denominator: [] }, false)).toThrow();
		}
	});
});

describe('unit cancellation', () => {
	it('shares unchanged records on both sides and copies changed exponents', () => {
		const numerator = normalizePowers([
			{ unit: '<meter>', prefix: '<kilo>', exponent: 1 },
			{ unit: '<meter>', exponent: 5 }, { unit: '<second>', exponent: 3 },
			{ unit: '<kilogram>', exponent: 1 },
		]);
		const denominator = normalizePowers([
			{ unit: '<meter>', exponent: 2 }, { unit: '<second>', exponent: 5 },
			{ unit: '<kilogram>', exponent: 1 }, { unit: '<ampere>', exponent: 2 },
		]);
		const [num, den] = cancelPowers(numerator, denominator);
		expect(num).toEqual([
			{ unit: '<meter>', prefix: '<kilo>', exponent: 1 }, { unit: '<meter>', exponent: 3 },
		]);
		expect(den).toEqual([{ unit: '<second>', exponent: 2 }, { unit: '<ampere>', exponent: 2 }]);
		expect(num[0]).toBe(numerator[0]);
		expect(den[1]).toBe(denominator[3]);
		expect(num[1]).not.toBe(numerator[1]);
		expect(num[1]).not.toBe(denominator[0]);
		expect(den[0]).not.toBe(numerator[2]);
		expect(den[0]).not.toBe(denominator[1]);
		expect(numerator.map(term => term.exponent)).toEqual([1, 5, 3, 1]);
		expect(denominator.map(term => term.exponent)).toEqual([2, 5, 1, 2]);
		for (const side of [num, den]) {
			expect(Object.isFrozen(side)).toBe(true);
			expect(normalizePowers(side)).toBe(side);
			side.forEach(term => expect(Object.isFrozen(term)).toBe(true));
		}
	});

	it('does not share mutable external records when other terms cancel', () => {
		const numerator = [{ unit: '<meter>', exponent: 1 }, { unit: '<second>', exponent: 1 }];
		const denominator = [{ unit: '<second>', exponent: 1 }, { unit: '<kilogram>', exponent: 1 }];
		const [num, den] = cancelPowers(numerator, denominator);
		expect(num[0]).not.toBe(numerator[0]);
		expect(den[0]).not.toBe(denominator[1]);
		numerator[0].exponent = 9;
		denominator[1].exponent = 9;
		expect(num).toEqual([{ unit: '<meter>', exponent: 1 }]);
		expect(den).toEqual([{ unit: '<kilogram>', exponent: 1 }]);
	});

	for (const [name, Base] of [['Decimal', Quantity], ['number', NumberQuantity]]) {
		it.each([true, false])(`shares residual product and quotient records for ${name}, cache=%s`, cache => {
			const Q = Base.withConfig({ cache });
			const speed = new Q('6 km/s'), factor = new Q('2 s/kg');
			const product = speed.mul(factor), quotient = speed.div(new Q('2 km'));
			expect(product.units()).toBe('km/kg');
			expect(product.scalar.toString()).toBe('12');
			expect(product.numerator[0]).toBe(speed.numerator[0]);
			expect(product.denominator[0]).toBe(factor.denominator[0]);
			expect(quotient.units()).toBe('1/s');
			expect(quotient.scalar.toString()).toBe('3');
			expect(quotient.denominator[0]).toBe(speed.denominator[0]);
		});
	}

	it('reuses normalized disjoint sides, including different prefixes on the same unit', () => {
		const numerator = normalizePowers([
			{ unit: '<meter>', prefix: '<kilo>', exponent: 2 },
			{ unit: '<kilogram>', exponent: 1 },
		]);
		const denominator = normalizePowers([
			{ unit: '<meter>', exponent: 2 },
			{ unit: '<second>', exponent: 1 },
		]);
		const [num, den] = cancelPowers(numerator, denominator);
		expect(num).toBe(numerator);
		expect(den).toBe(denominator);
	});

	it('owns and freezes external arrays even when no units cancel', () => {
		const numerator = [{ unit: '<meter>', exponent: 1 }];
		const denominator = [{ unit: '<second>', exponent: 1 }];
		const [num, den] = cancelPowers(numerator, denominator);
		numerator[0].exponent = 2;
		denominator.length = 0;
		expect(num).toEqual([{ unit: '<meter>', exponent: 1 }]);
		expect(den).toEqual([{ unit: '<second>', exponent: 1 }]);
		for (const side of [num, den]) {
			expect(Object.isFrozen(side)).toBe(true);
			expect(Object.isFrozen(side[0])).toBe(true);
		}
	});

	it('still coalesces, cancels and preserves residual order when sides overlap', () => {
		const [num, den] = cancelPowers([
			{ unit: '<meter>', exponent: 1 }, { unit: '<second>', exponent: 3 },
			{ unit: '<meter>', exponent: 1 }, { unit: '<kilogram>', exponent: 1 },
		], [{ unit: '<second>', exponent: 1 }, { unit: '<meter>', exponent: 4 }]);
		expect(num).toEqual([{ unit: '<second>', exponent: 2 }, { unit: '<kilogram>', exponent: 1 }]);
		expect(den).toEqual([{ unit: '<meter>', exponent: 2 }]);
	});
});

describe('shared temperature unit structures', () => {
	it.each([
		['tempC', '<celsius>', 'degC'], ['tempF', '<fahrenheit>', 'degF'],
		['tempK', '<kelvin>', 'degK'], ['tempR', '<rankine>', 'degR'],
	])('produces frozen interval units for %s across numerical contexts and parsers', (absolute, token, interval) => {
		const LowPrecision = RegexQuantity.withConfig({ numeric: { precision: 3 } });
		const a = new Quantity(`20 ${absolute}`), b = new LowPrecision(`10 ${absolute}`);
		const difference = a.sub(b);
		expect(difference.scalar.toString()).toBe('10');
		expect(difference.units()).toBe(interval);
		expect(Object.isFrozen(difference.numerator)).toBe(true);
		expect(difference.numerator).toEqual([{ unit: token, exponent: 1 }]);
		expect(a.add(`2 ${interval}`).scalar.toString()).toBe('22');

		for (const Base of [Quantity, RegexQuantity, NumberQuantity]) {
			for (const cache of [true, false]) {
				const Q = Base.withConfig({ cache });
				const source = new Q(`30 ${absolute}`), other = new Q(`10 ${absolute}`);
				const result = source.sub(other);
				expect(result.scalar.toString()).toBe('20');
				expect(result.numeric).toBe(source.numeric);
				expect(result.numerator).toBe(difference.numerator);
				expect(result.denominator).toBe(difference.denominator);
				expect(source.sub(other).numerator).toBe(result.numerator);
			}
		}
		expect(Object.isFrozen(difference.numerator[0])).toBe(true);
		expect(() => { difference.numerator[0].exponent = 2; }).toThrow(TypeError);
	});

	it('shares absolute-kelvin units across scales, backends and cache settings', () => {
		const reference = new Quantity('0 tempC').toBase();
		for (const Base of [Quantity, RegexQuantity, NumberQuantity]) {
			for (const cache of [true, false]) {
				const Q = Base.withConfig({ cache });
				for (const input of ['0 tempC', '32 tempF', '491.67 tempR']) {
					const source = new Q(input), result = source.toBase();
					expect(result.numeric.toNumber(result.scalar)).toBeCloseTo(273.15, 10);
					expect(result.units()).toBe('tempK');
					expect(result.numeric).toBe(source.numeric);
					expect(result.numerator).toBe(reference.numerator);
					expect(result.denominator).toBe(reference.denominator);
					expect(source.toBase().numerator).toBe(result.numerator);
				}
			}
		}
		expect(Object.isFrozen(reference.numerator)).toBe(true);
		expect(Object.isFrozen(reference.numerator[0])).toBe(true);
		expect(Object.isFrozen(reference.denominator)).toBe(true);
		const kelvin = new NumberQuantity('273.15 tempK');
		expect(kelvin.toBase()).toBe(kelvin);
	});
});
