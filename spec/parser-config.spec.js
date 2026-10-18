import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const testNumeric = new DecimalScientificAdapter();
import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { createQuantityClass } from '@neutrium/quantity/factory';
import { NearleyParser, RegexParser } from '@neutrium/quantity/parsers.js';

for (const Parser of [NearleyParser, RegexParser])
{
	describe(`memory budgets: ${Parser.name}`, () => {
		it('evicts by byte weight in least-recently-used order before the entry limit', () => {
			const probe = new Parser({});
			probe.parse('m2', testNumeric);
			const maxBytes = probe.cacheStats.estimatedBytes * 2 + 32;
			const parser = new Parser({ cache: { maxEntries: 100, maxBytes } });
			const metre = parser.parse('m2', testNumeric), second = parser.parse('s2', testNumeric);
			expect(parser.cacheStats.entries).toBe(2);
			expect(parser.parse('m2', testNumeric).numerator).toBe(metre.numerator);
			parser.parse('kg2', testNumeric);
			expect(parser.cacheStats.entries).toBe(2);
			expect(parser.parse('m2', testNumeric).numerator).toBe(metre.numerator);
			expect(parser.parse('s2', testNumeric).numerator).not.toBe(second.numerator);
			expect(parser.cacheStats.estimatedBytes).toBeLessThanOrEqual(maxBytes);
		});

		it('skips oversized plans without rejecting input or flushing hot plans', () => {
			const parser = new Parser({ cache: { maxBytes: 2048 } });
			const hot = parser.parse('m2', testNumeric), before = parser.cacheStats;
			const input = Array(2000).fill('m').join('*');
			const a = parser.parse(input, testNumeric), b = parser.parse(input, testNumeric);
			expect(a.numerator).toEqual([{ unit: '<meter>', exponent: 2000 }]);
			expect(b.numerator).toEqual(a.numerator);
			expect(b.numerator).not.toBe(a.numerator);
			expect(parser.cacheStats).toEqual(before);
			expect(parser.parse('m2', testNumeric).numerator).toBe(hot.numerator);
		});

		it('supports disabled caches, entry limits, and clearing accounting', () => {
			for (const cache of [{ maxEntries: 0 }, { maxBytes: 0 }]) {
				const parser = new Parser({ cache });
				const first = parser.parse('m2', testNumeric);
				expect(parser.parse('m2', testNumeric).numerator).not.toBe(first.numerator);
				expect(parser.cacheStats.entries).toBe(0);
				expect(parser.cacheStats.estimatedBytes).toBe(0);
			}
			const parser = new Parser({ cache: { maxEntries: 1 } });
			const first = parser.parse('2 m2', testNumeric);
			parser.parse('s2', testNumeric);
			expect(parser.cacheStats.entries).toBe(1);
			const reparsed = parser.parse('4 m2', testNumeric);
			expect(reparsed.numerator).not.toBe(first.numerator);
			expect(reparsed.numerator).toEqual(first.numerator);
			expect(reparsed.scalar.toString()).toBe('4');
			parser.clearCache();
			expect(parser.cacheStats.entries).toBe(0);
			expect(parser.cacheStats.estimatedBytes).toBe(0);
		});

		it('snapshots options and isolates direct configurations while sharing explicit snapshots', () => {
			const options = { cache: { maxBytes: 4096, maxEntries: 3 } };
			const a = new Parser(options), b = new Parser(options), shared = new Parser(a.config);
			const value = a.parse('m2', testNumeric);
			expect(shared.parse('m2', testNumeric).numerator).toBe(value.numerator);
			expect(b.parse('m2', testNumeric).numerator).not.toBe(value.numerator);
			options.cache.maxBytes = 0;
			expect(a.config.cache.maxBytes).toBe(4096);
			expect(Object.isFrozen(a.config)).toBe(true);
			expect(Object.isFrozen(a.config.cache)).toBe(true);
			expect(Object.isFrozen(a.cacheStats)).toBe(true);
			expect(() => { a.config = {}; }).toThrow();
			const previous = a.cacheStats;
			shared.clearCache();
			expect(a.cacheStats.entries).toBe(0);
			expect(previous.entries).toBe(1);
			expect(b.cacheStats.entries).toBe(1);
		});
	});
}

it('accounts for Nearley scalar instructions as well as input length', () => {
	const parser = new NearleyParser({ cache: { maxBytes: 8192 } });
	const hot = parser.parse('m2', testNumeric);
	const before = parser.cacheStats;
	const input = Array(100).fill('2').join('*') + ' m'; // Short text, large scalar program.
	expect(input.length * 2).toBeLessThan(8192);
	const result = parser.parse(input, testNumeric);
	let expected = new Decimal(1);
	for (let i = 0; i < 100; i++) expected = expected.mul(2);
	expect(result.scalar.toString()).toBe(expected.toString());
	expect(parser.cacheStats).toEqual(before);
	expect(parser.parse('m2', testNumeric).numerator).toBe(hot.numerator);
});

for (const Entry of [Quantity, RegexQuantity])
{
	describe(`combined configuration: ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {
		it('shares one bounded cache across a configured class and derived results', () => {
			const Q = Entry.withConfig({ numeric: { precision: 6, rounding: 'down' }, cache: { parser: { maxEntries: 2, maxBytes: 4096 } } });
			const a = new Q('2 m2'), b = new Q('3 m2');
			expect(b.numerator).toBe(a.numerator);
			expect(a.parserConfig).toBe(Q.parserConfig);
			expect(Q.config.numeric.precision).toBe(6);
			expect(a.div(3).scalar.toString()).toBe('0.666666');
			for (const result of [a.clone(), a.add('1 m2'), a.mul('2'), a.to('cm2')]) {
				expect(result).toBeInstanceOf(Q);
				expect(result.config).toBe(Q.config);
				expect(result.parserConfig).toBe(Q.parserConfig);
			}
			new Q('1 s2'); new Q('1 kg2');
			expect(new Q('4 m2').numerator).not.toBe(a.numerator);
		});

		it('inherits partial settings and isolates classes that configure parser options', () => {
			const Q = Entry.withConfig({ numeric: { precision: 6 }, cache: { parser: { maxEntries: 10, maxBytes: 4096 } } });
			const Numeric = Q.withConfig({ numeric: { precision: 30 } });
			const NoCache = Q.withConfig({ cache: { parser: { maxBytes: 0 } } });
			expect(Numeric.parserConfig).toBe(Q.parserConfig);
			expect(NoCache.config.numeric.precision).toBe(6);
			expect(NoCache.parserConfig.cache).toEqual({ maxEntries: 10, maxBytes: 0 });
			const a = new Q('1 m2');
			expect(new Numeric('2 m2').numerator).toBe(a.numerator);
			expect(new NoCache('2 m2').numerator).not.toBe(new NoCache('3 m2').numerator);
			const Other = Entry.withConfig({ cache: { parser: { maxEntries: 10, maxBytes: 4096 } } });
			expect(new Other('2 m2').numerator).not.toBe(a.numerator);
			expect(new Q('3 m2').numerator).toBe(a.numerator);
			expect(Entry.parserConfig.cache.maxBytes).toBe(4 * 1024 * 1024);
			expect(Entry.parserConfig.cache.maxEntries).toBe(1024);
		});

		it('retains an explicit parser override while honoring the class cache policy', () => {
			const Q = Entry.withConfig({ numeric: { precision: 7 }, cache: { parser: { maxBytes: 0 } } });
			const parser = new RegexParser({ cache: { maxEntries: 1 } });
			const a = new Q('1 m2', undefined, parser);
			expect(a.parserConfig).toBe(parser.config);
			expect(a.clone().parserConfig).toBe(parser.config);
			expect(a.to('cm2').parserConfig).toBe(parser.config);
			expect(parser.cacheStats.entries).toBe(0);
		});
	});
}

it('passes frozen parser settings through the custom-parser factory API', () => {
	const seen = [];
	const Custom = createQuantityClass({ numeric: testNumeric, parser: config => { seen.push(config); return new RegexParser(config); } });
	const Q = Custom.withConfig({ numeric: { precision: 4 }, cache: { parser: { maxEntries: 1, maxBytes: 4096 } } });
	const a = new Q('2 m2'), b = new Q('3 m2');
	expect(b.numerator).toBe(a.numerator);
	expect(seen).toEqual([Q.parserConfig, Q.parserConfig]);
	expect(a.div(3).scalar.toString()).toBe('0.6667');
	expect(a.to('cm2').parserConfig).toBe(Q.parserConfig);
	expect(seen).toHaveLength(2); // Derived results retain the originating parser.
});

it('invalidates configured Regex caches when shared patterns are rebuilt', () => {
	const a = new RegexParser({ cache: { maxBytes: 4096 } });
	const b = new RegexParser({ cache: { maxBytes: 8192 } });
	const first = a.parse('m2', testNumeric), second = b.parse('m2', testNumeric);
	a.initialize();
	expect(a.cacheStats.entries).toBe(0);
	expect(b.cacheStats.entries).toBe(0);
	expect(a.parse('m2', testNumeric).numerator).not.toBe(first.numerator);
	expect(b.parse('m2', testNumeric).numerator).not.toBe(second.numerator);
});

// Utilities owns the exhaustive configuration-validation matrix. Keep one wiring
// check per parser to ensure invalid nested options reach the shared validators.
it('passes parser and nested cache options to validation', () => {
	for (const Parser of [NearleyParser, RegexParser]) {
		expect(() => new Parser({ unknown: true })).toThrow(/Unknown parser option/);
		expect(() => new Parser({ cache: { maxBytes: -1 } })).toThrow(/parser cache maxBytes/);
		expect(() => new Parser({ cache: { maxByte: 1024 } })).toThrow(/Unknown parser cache option/);
	}
});
