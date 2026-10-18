import { describe, expect, it } from 'vitest';
import { Quantity } from '../dist/number.js';
import { Quantity as DecimalQuantity } from '../dist/Quantity.js';
import { NumberAdapter } from '@neutrium/utilities/number';
import { createQuantityClass } from '../dist/factory.js';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';
import { floatAdapter } from './helpers/numeric.js';

function expectRelative(actual, expected, tolerance = 1e-12) {
	expect(Number.isFinite(actual)).toBe(true);
	expect(Math.abs(actual / expected - 1)).toBeLessThan(tolerance);
}

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
