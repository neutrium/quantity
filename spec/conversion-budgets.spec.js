import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const testNumeric = new DecimalScientificAdapter();
import { describe, expect, it, vi } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { createQuantityClass } from '@neutrium/quantity/factory';
import { RegexParser } from '@neutrium/quantity/parsers/regex';
import { NearleyParser } from '@neutrium/quantity/parsers/nearley';


for (const Entry of [Quantity, RegexQuantity])
{
	const Parser = Entry === Quantity ? NearleyParser : RegexParser;
	describe(`conversion budgets: ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {
		it('does not retain padded or oversized targets while reusing the converted result', () => {
			const Q = Entry.withConfig({ cache: { parser: { maxBytes: 0 }, conversionResults: { maxBytes: 4096 } } });
			const parser = new Parser(Q.parserConfig), parse = vi.spyOn(parser, 'parse');
			const source = new Q('1 m', undefined, parser), hot = source.to('cm');
			for (const text of [' '.repeat(100000) + 'cm', `2 ${' '.repeat(10000)}cm`]) {
				parse.mockClear();
				expect(source.to(text)).toBe(hot);
				expect(source.to(text)).toBe(hot);
				expect(parse).toHaveBeenCalledTimes(2);
			}
			parse.mockClear();
			expect(source.to('cm')).toBe(hot);
			expect(parse).not.toHaveBeenCalled();
		});

		it('evicts expressions and results by byte weight before the entry limit', () => {
			const Q = Entry.withConfig({ cache: { conversionResults: { maxEntries: 100, maxBytes: 5600 } } });
			const parser = new Parser(Q.parserConfig), parse = vi.spyOn(parser, 'parse');
			const source = new Q('1 m', undefined, parser);
			const expression = i => `${i}${' '.repeat(400)}cm`;
			for (let i = 1; i <= 20; i++) {
				expect(source.to(expression(i)).scalar.toString()).toBe('100');
			}
			parse.mockClear();
			expect(source.to(expression(20)).scalar.toString()).toBe('100');
			expect(parse).not.toHaveBeenCalled();
			expect(source.to(expression(1)).scalar.toString()).toBe('100');
			expect(parse).toHaveBeenCalledTimes(1);
			const hot = source.to('cm');
			const cold = source.to('m*s/s');
			let recent;
			for (let i = 1; i <= 20; i++) {
				recent = source.to(`m*s${i}/s${i}`);
				expect(source.to('cm')).toBe(hot);
			}
			expect(source.to('m*s20/s20')).toBe(recent);
			expect(source.to('m*s/s')).not.toBe(cold);
			expect(source.to('cm')).toBe(hot);
		});

		it('bypasses oversized results without evicting hot results, for either target form', () => {
			const Q = Entry.withConfig({ cache: { conversionResults: { maxBytes: 2048 } } });
			const source = new Q('1 m'), hot = source.to('cm');
			const targetText = 'cm*s*kg*A*mol*cd*rad/s/kg/A/mol/cd/rad';
			const target = new Q(targetText);
			for (const input of [targetText, target]) {
				const first = source.to(input), second = source.to(input);
				expect(first.scalar.toString()).toBe('100');
				expect(second.scalar.toString()).toBe('100');
				expect(first).not.toBe(second);
				expect(source.to('cm')).toBe(hot);
			}
		});

		it('uses one bounded result cache for strings and live Quantity targets', () => {
			const Q = Entry.withConfig({ cache: { conversionResults: { maxEntries: 1 } } });
			const source = new Q('1 m'), cm = new Q('cm'), mm = new Q('mm');
			const first = source.to(cm);
			expect(source.to('cm')).toBe(first);
			const second = source.to(mm);
			expect(source.to(cm)).not.toBe(first);
			expect(source.to(mm)).not.toBe(second);
			for (const conversionCache of [{ maxBytes: 0 }, { maxEntries: 0 }]) {
				const Disabled = Q.withConfig({ cache: { conversionResults: conversionCache } }), value = new Disabled('1 m');
				for (const input of ['cm', cm]) {
					expect(value.to(input).scalar.toString()).toBe('100');
					expect(value.to(input)).not.toBe(value.to(input));
				}
			}
		});

		it('merges immutable settings and retains them in derived quantities', () => {
			const conversionCache = { maxEntries: 2, maxBytes: 5600 };
			const Q = Entry.withConfig({ numeric: { precision: 6 }, cache: { conversionResults: conversionCache } });
			const Child = Q.withConfig({ cache: { conversionResults: { maxBytes: 2000 } } });
			conversionCache.maxBytes = 0;
			expect(Child.conversionCacheConfig).toEqual({ maxEntries: 2, maxBytes: 2000 });
			expect(Q.withConfig({ numeric: { precision: 10 } }).conversionCacheConfig).toBe(Q.conversionCacheConfig);
			const value = new Q('1 m');
			for (const result of [value.clone(), value.add('1 m'), value.to('cm')]) {
				expect(result.conversionCacheConfig).toBe(Q.conversionCacheConfig);
				expect(result.config.numeric.precision).toBe(6);
			}
			expect(Object.isFrozen(Q.conversionCacheConfig)).toBe(true);
			expect(Entry.conversionCacheConfig.maxBytes).toBe(4 * 1024 * 1024);
			expect(Entry.conversionCacheConfig.maxEntries).toBe(1024);
			expect(() => { Q.conversionCacheConfig.maxBytes = 0; }).toThrow();
		});

		it('accounts for scalar digits without formatting under a restricted output limit', () => {
			const Q = Entry.withConfig({ numeric: { precision: 3000, maxOutputDigits: 5 }, cache: { conversionResults: { maxBytes: 2048 } } });
			const q = new Q('1 m');
			const small = q.to('cm');
			expect(small.scalar.eq(100)).toBe(true);
			expect(q.to('cm')).toBe(small);
			const large = new Q(new Decimal('1'.repeat(2000)), 'm');
			// An unchanged scale preserves the exact input digits rather than rounding.
			const first = large.to('m*s/s');
			expect(first.scalar.isFinite()).toBe(true);
			expect(first.scalar.precision()).toBe(2000);
			expect(large.to('m*s/s')).not.toBe(first);
		});
	});
}

// Validate the Quantity configuration boundary, not utilities' full input matrix.
it('passes conversion limits to validation with conversion-specific diagnostics', () => {
	expect(() => Quantity.withConfig({ cache: { conversionResults: { maxEntries: -1 } } }))
		.toThrow(/cache\.conversionResults maxEntries/);
	expect(() => Quantity.withConfig({ cache: { conversionResults: { maxByte: 1024 } } }))
		.toThrow(/Unknown cache\.conversionResults option/);
});

it('does not normalize custom parser inputs when caching conversion expressions', () => {
	const Custom = createQuantityClass({ numeric: testNumeric, parser: () => ({ parse(text) {
		return new RegexParser().parse(text === ' cm ' ? 'mm' : text, testNumeric);
	} }) });
	const q = new Custom('1 m');
	expect(q.to(' cm ').scalar.toString()).toBe('1000');
	expect(q.to('cm').scalar.toString()).toBe('100');
	expect(q.to(' cm ').scalar.toString()).toBe('1000');
});
