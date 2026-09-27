import { describe, expect, it, vi } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { createQuantityClass } from '@neutrium/quantity/core';
import { RegexQtyParser } from '@neutrium/quantity/parsers/regex';
import { NearleyQtyParser } from '@neutrium/quantity/parsers/nearley';


for (const Entry of [Quantity, RegexQuantity]) {
	const Parser = Entry === Quantity ? NearleyQtyParser : RegexQtyParser;
	describe(`conversion budgets: ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {
		it('does not retain padded or oversized targets while reusing the converted result', () => {
			const Q = Entry.withConfig({ parser: { cache: { maxBytes: 0 } }, conversionCache: { maxBytes: 4096 } });
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
			const Q = Entry.withConfig({ conversionCache: { maxEntries: 100, maxBytes: 5000 } });
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
			const Q = Entry.withConfig({ conversionCache: { maxBytes: 2048 } });
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
			const Q = Entry.withConfig({ conversionCache: { maxEntries: 1 } });
			const source = new Q('1 m'), cm = new Q('cm'), mm = new Q('mm');
			const first = source.to(cm);
			expect(source.to('cm')).toBe(first);
			const second = source.to(mm);
			expect(source.to(cm)).not.toBe(first);
			expect(source.to(mm)).not.toBe(second);
			for (const conversionCache of [{ maxBytes: 0 }, { maxEntries: 0 }]) {
				const Disabled = Q.withConfig({ conversionCache }), value = new Disabled('1 m');
				for (const input of ['cm', cm]) {
					expect(value.to(input).scalar.toString()).toBe('100');
					expect(value.to(input)).not.toBe(value.to(input));
				}
			}
		});

		it('merges immutable settings and retains them in derived quantities', () => {
			const conversionCache = { maxEntries: 2, maxBytes: 5000 };
			const Q = Entry.withConfig({ precision: 6, conversionCache });
			const Child = Q.withConfig({ conversionCache: { maxBytes: 2000 } });
			conversionCache.maxBytes = 0;
			expect(Child.conversionCacheConfig).toEqual({ maxEntries: 2, maxBytes: 2000 });
			expect(Q.withConfig({ precision: 10 }).conversionCacheConfig).toBe(Q.conversionCacheConfig);
			const value = new Q('1 m');
			for (const result of [value.clone(), value.add('1 m'), value.to('cm')]) {
				expect(result.conversionCacheConfig).toBe(Q.conversionCacheConfig);
				expect(result.config.precision).toBe(6);
			}
			expect(Object.isFrozen(Q.conversionCacheConfig)).toBe(true);
			expect(Entry.conversionCacheConfig.maxBytes).toBe(4 * 1024 * 1024);
			expect(Entry.conversionCacheConfig.maxEntries).toBe(1024);
			expect(() => { Q.conversionCacheConfig.maxBytes = 0; }).toThrow();
		});

		it('accounts for scalar digits without formatting under a restricted output limit', () => {
			const Q = Entry.withConfig({ precision: 300, maxOutputDigits: 5, conversionCache: { maxBytes: 2048 } });
			const q = new Q('1 m');
			const small = q.to('cm');
			expect(small.scalar.eq(100)).toBe(true);
			expect(q.to('cm')).toBe(small);
			const large = new Q(new Decimal('1'.repeat(200)), 'm');
			// An unchanged scale preserves the exact input digits rather than rounding.
			const first = large.to('m*s/s');
			expect(first.scalar.isFinite()).toBe(true);
			expect(first.scalar.precision()).toBe(200);
			expect(large.to('m*s/s')).not.toBe(first);
		});
	});
}

it('validates conversion limits using the same rules as parser limits', () => {
	for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1024', null])
		for (const key of ['maxEntries', 'maxBytes'])
			expect(() => Quantity.withConfig({ conversionCache: { [key]: value } })).toThrow();
	for (const conversionCache of [null, [], 1, { maxByte: 1024 }])
		expect(() => Quantity.withConfig({ conversionCache })).toThrow();
});

it('does not normalize custom parser inputs when caching conversion expressions', () => {
	const Custom = createQuantityClass(() => ({ parse(text) {
		return new RegexQtyParser().parse(text === ' cm ' ? 'mm' : text);
	} }));
	const q = new Custom('1 m');
	expect(q.to(' cm ').scalar.toString()).toBe('1000');
	expect(q.to('cm').scalar.toString()).toBe('100');
	expect(q.to(' cm ').scalar.toString()).toBe('1000');
});
