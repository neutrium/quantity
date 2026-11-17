import { describe, expect, it } from 'vitest';
import { Quantity } from '../dist/number.js';
import { Quantity as DecimalQuantity } from '../dist/Quantity.js';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { createQuantityClass } from '../dist/factory.js';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';
import { floatAdapter } from './helpers/numeric.js';

function expectRelative(actual, expected, tolerance = 1e-12) {
	expect(Number.isFinite(actual)).toBe(true);
	expect(Math.abs(actual / expected - 1)).toBeLessThan(tolerance);
}

it.each([true, false])('applies unit ratios to BigInt operands before division, cache=%s', cache => {
	const Q = createQuantityClass({ numeric: new BigIntAdapter(), parser: c => new RegexParser(c), config: { cache } });
	for (const [source, target] of [['1000 m', 'km'], ['100 cm', 'm'], ['12 in', 'ft'], ['60 rpm', 'Hz']]) {
		expect(new Q(source).to(target).scalar).toBe(1n);
	}
	expect(new Q('-150 cm').to('m').scalar).toBe(-1n);
	const metres = 9007199254740993n;
	expect(new Q(metres * 100n, 'cm').to('m').scalar).toBe(metres);
	expect(new Q('2 m').mul('50 cm').scalar).toBe(1n);
	expect(new Q('2 m').div('50 cm').scalar).toBe(4n);
	expect(new Q('2 m').to('1/km').scalar).toBe(500n);
	expect(new Q('199 cm').gt('1 m')).toBe(true);
});

for (const cache of [true, false]) {
	const Q = createQuantityClass({ numeric: new BigIntAdapter(), parser: c => new RegexParser(c), config: { cache } });

	it(`rounds the complete signed cross-unit sum, cache=${cache}`, () => {
		for (const [left, operation, right, expected] of [
			['1 m', 'sub', '50 cm', 0n], ['-1 m', 'add', '50 cm', 0n],
			['1 m', 'sub', '250 cm', -1n], ['-1 m', 'add', '250 cm', 1n],
			['2 m^(1/2)', 'sub', '1 ft^(1/2)', 1n],
		]) expect(new Q(left)[operation](right).scalar).toBe(expected);
	});

	it(`keeps division semantics across the expansion budget, cache=${cache}`, () => {
		for (const power of [1365, 1366, Number.MAX_SAFE_INTEGER]) {
			for (const sign of [1n, -1n]) {
				expect(new Q(sign, 'mm^' + power).to('m^' + power).scalar).toBe(0n);
			}
		}
		const large = 10n ** 4098n;
		expect(new Q(large + 1n, 'mm^1366').to('m^1366').scalar).toBe(1n);
		expect(new Q('-1 m^1366').to('mm^1366').scalar).toBe(-large);
	});

	it(`converts and compares absolute scales before integer division, cache=${cache}`, () => {
		const rankine = new Q('9 tempR'), kelvin = new Q('5 tempK');
		expect(rankine.to('tempK').scalar).toBe(5n);
		expect(rankine.toBase().scalar).toBe(5n);
		expect(kelvin.to('tempR').scalar).toBe(9n);
		expect(rankine.eq(kelvin)).toBe(true);
		expect(new Q('1 tempR').gt('0 tempK')).toBe(true);
		expect(new Q('1 tempK').lt('2 tempR')).toBe(true);
		expect(new Q('2 tempR').sub('1 tempK').scalar).toBe(0n);
		expect(new Q('1 tempK').sub('1 degR').scalar).toBe(0n);
		expect(() => new Q('1 tempK').sub('2 degR')).toThrow(/absolute zero/);
		expect(new Q('1 degR').to('tempR').scalar).toBe(1n);
	});

	it(`orders exact unit ratios independently of integer rounding, cache=${cache}`, () => {
		for (const [a, b, sign] of [
			['12 in', '1 ft', 0], ['-12 in', '-2 ft', 1],
			['4 km', '4001 m', -1], ['1 mm^1000000', '1 m^1000000', -1],
		]) {
			const left = new Q(a), right = new Q(b);
			expect(left.compareTo(right)).toBe(sign);
			expect(right.compareTo(left)).toBe(sign ? -sign : 0);
		}
	});
}

it('applies the temperature ratio to the reading on arithmetic-only adapters', () => {
	const numeric = new BigIntAdapter();
	numeric.toRationalTerm = undefined;
	const Q = createQuantityClass({ numeric, parser: c => new RegexParser(c) });
	expect(new Q('9 tempR').to('tempK').scalar).toBe(5n);
	expect(new Q('5 tempK').to('tempR').scalar).toBe(9n);
});

it.each([true, false])('preserves absolute and interval readings on identical physical scales, cache=%s', cache => {
	const Q = Quantity.withConfig({ cache });
	for (const [absolute, interval] of [['tempR', 'degR'], ['tempR', 'degF*m/m'], ['tempK', 'degC']]) {
		for (const value of [7, 11]) {
			const a = new Q(value, absolute), b = new Q(value, interval);
			expect(a.eq(b)).toBe(true);
			expect(b.compareTo(a)).toBe(0);
			expect(a.to(b).scalar).toBe(value);
			expect(b.to(a).scalar).toBe(value);
		}
		expect(() => new Q(-1, interval).to(absolute)).toThrow(/absolute zero/);
	}
	expect(new Q('7 tempC').eq('7 degC')).toBe(false);
	expect(new Q('7 tempR').eq('7 mdegR')).toBe(false);
});

it.each([true, false])('uses a consistent scale for finite native comparisons, cache=%s', cache => {
	const Q = Quantity.withConfig({ cache });
	for (const [left, right] of [['0.07 m', '7 cm'], ['645 inch', '16383 mm']]) {
		const a = new Q(left), b = new Q(right);
		expect(a.eq(b)).toBe(true);
		expect(b.eq(a)).toBe(true);
	}
	for (const sign of [1, -1]) {
		const a = new Q(sign, 'm'), b = new Q(sign, 'cm');
		expect(a.compareTo(b)).toBe(sign);
		expect(b.compareTo(a)).toBe(-sign);
	}
});

it('adds and subtracts nonfinite operands before scaling a finite value', () => {
	const negative = new Quantity(-Infinity, 'm'), positive = new Quantity(Infinity, 'm');
	const finite = new Quantity('1e308 km');
	expect(negative.add(finite).scalar).toBe(-Infinity);
	expect(finite.add(negative).scalar).toBe(-Infinity);
	expect(positive.sub(finite).scalar).toBe(Infinity);
	expect(negative.add(new Quantity(Infinity, 'km')).scalar).toBeNaN();
});

for (const Parser of [NearleyParser, RegexParser]) {
	for (const cache of [true, false]) {
		const Q = createQuantityClass({ numeric: new NumberAdapter(), parser: c => new Parser(c), config: { cache } });
		describe(`native catalog factors (${Parser.name}, cache ${cache})`, () => {
			it.each([150, 200, 500])('converts finite factors at power %i in both directions', power => {
				const source = new Q(`1 inch${power}`);
				const converted = source.to(`cm${power}`);
				expectRelative(converted.scalar, 2.54 ** power);
				expectRelative(converted.to(source).scalar, 1);
				expectRelative(new Q(`1 cm${power}`).to(source).scalar, 2.54 ** -power);
				// A fresh receiver also exercises the cached factor, rather than its result cache.
				expectRelative(new Q(`2 inch${power}`).to(`cm${power}`).scalar, 2 * 2.54 ** power);
			});

			it('preserves comparison ordering and cross-unit arithmetic', () => {
				const small = new Q('1 inch150'), large = new Q('1e100 cm150');
				expect(small.compareTo(large)).toBe(-1);
				expect(large.compareTo(small)).toBe(1);
				expect(new Q('1 inch200').compareTo('1 cm200')).toBe(1);
				expectRelative(new Q('1 cm200').add('1 inch200').scalar, 1 + 2.54 ** 200);
				expectRelative(new Q('1 cm200').mul('1 inch200').scalar, 2.54 ** 200);
				expectRelative(new Q('1 cm200').div('1 inch200').scalar, 2.54 ** -200);
				expectRelative(new Q('2 inch200').to('cm^-200').scalar, 0.5 * 2.54 ** -200);
			});
		});
	}
}

it('normalizes catalog factors for a custom float32 backend', () => {
	const Q = createQuantityClass({ numeric: floatAdapter, parser: c => new RegexParser(c) });
	const converted = new Q('1 inch20').to('cm20');
	expectRelative(converted.scalar, Math.fround(2.54 ** 20), 1e-6);
	expectRelative(converted.to('inch20').scalar, 1, 1e-6);
});

it('keeps true factor overflow and underflow without producing NaN', () => {
	expect(new Quantity('1 inch1000000').to('cm1000000').scalar).toBe(Infinity);
	expect(new Quantity('1 cm1000000').to('inch1000000').scalar).toBe(0);
});

it('orders zero and infinities before a unit conversion can underflow or overflow', () => {
	const zero = new Quantity('0 m');
	for (const sign of [1, -1]) {
		const tiny = new Quantity(sign * Number.MIN_VALUE, 'mm');
		expect(tiny.compareTo(zero)).toBe(sign);
		expect(zero.compareTo(tiny)).toBe(-sign);
		const infinity = new Quantity(sign * Infinity, 'm');
		const large = new Quantity(sign * Number.MAX_VALUE, 'km');
		expect(infinity.compareTo(large)).toBe(sign);
		expect(large.compareTo(infinity)).toBe(-sign);
	}
});

it('preserves signed zero in cross-unit products and quotients with extreme scales', () => {
	const zero = new Quantity('0 km400');
	const negative = new Quantity('-1 m400');
	expect(negative.mul(zero).scalar).toBe(-0);
	expect(zero.mul(negative).scalar).toBe(-0);
	expect(zero.div(negative).scalar).toBe(-0);
	expect(new Quantity(Infinity, 'km400').mul(negative).scalar).toBe(-Infinity);
});

it.each([true, false])('handles bounded products and subnormal factors with caching %s', cache => {
	const Q = Quantity.withConfig({ cache });
	for (const [input, target] of [
		['1 y(j)5000', 'y5000'], // Too large to expand, but the ratio is about 30.7.
		['1 inch200', 'Qm12*km2*cm186'], // A representable binary64 subnormal factor.
	]) {
		const reference = new DecimalQuantity(input).to(target);
		expectRelative(new Q(input).to(target).scalar, reference.numeric.toNumber(reference.scalar));
	}
});

it('preserves integer division when a distant fractional term crosses a whole unit', () => {
	const Q = createQuantityClass({ numeric: new BigIntAdapter(), parser: c => new RegexParser(c) });
	const units = 'm^1000000000000', smaller = 'mm^1000000000000';
	expect(new Q(1n, units).sub(new Q(1n, smaller)).scalar).toBe(0n);
	expect(new Q(-1n, units).add(new Q(1n, smaller)).scalar).toBe(0n);
});
