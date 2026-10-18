import { describe, expect, it, vi } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { NearleyParser, RegexParser } from '@neutrium/quantity/parsers.js';
import * as unitIdentity from '../dist/operations/unit-identity.js';


for (const [Entry, Parser] of [[Quantity, NearleyParser], [RegexQuantity, RegexParser]])
{
	describe(`same-unit conversion caching: ${Parser.name}`, () => {
		it.each([true, false, { metadata: false }])('does not construct conversion keys for identity targets with cache %j', cache => {
			const Q = Entry.withConfig({ cache });
			const source = new Q('2 m'), target = new Q('0 m');
			const key = vi.spyOn(unitIdentity, 'unitKey').mockImplementation(() => {
				throw new Error('Identity conversion should not need a conversion key');
			});
			expect(source.to(target)).toBe(source);
			expect(source.to('meter')).toBe(source);
			expect(source.to('meter')).toBe(source);
			expect(key).not.toHaveBeenCalled();
		});
		it('parses and constructs each successful identity target only once', () => {
			let constructions = 0;

			class Counted extends Entry
			{
				constructor(...args) { super(...args); constructions++; }
			}

			const parser = new Parser(), parse = vi.spyOn(parser, 'parse');

			for (const [input, expressions] of [
				['2 m', ['m', 'meter', '0 m', '-2 m']],
				['20 tempC', ['tempC', '-500 tempC']],
				['3', ['1', '0']],
			]) {
				const source = new Counted(input, undefined, parser);

				for (const expression of expressions)
				{
					constructions = 0;
					parse.mockClear();
					for (let i = 0; i < 10; i++) expect(source.to(expression)).toBe(source);
					expect(parse).toHaveBeenCalledTimes(1);
					expect(constructions).toBe(1);
				}
			}
		});

		it('shares the expression entry limit with changed-unit conversions and refreshes recency', () => {
			const Q = Entry.withConfig({ cache: { conversionResults: { maxEntries: 2 } } });
			const parser = new Parser(), parse = vi.spyOn(parser, 'parse');
			const source = new Q('1 m', undefined, parser);
			source.to('m');
			source.to('meter');
			source.to('m'); // Keep this identity hot while evicting the other alias.
			const cm = source.to('cm');
			parse.mockClear();
			expect(source.to('m')).toBe(source);
			expect(source.to('cm')).toBe(cm);
			expect(parse).not.toHaveBeenCalled();
			expect(source.to('meter')).toBe(source);
			expect(parse).toHaveBeenCalledTimes(1);
		});

		it('enforces expression byte limits and rejects padding without displacing a hot identity', () => {
			const Q = Entry.withConfig({ cache: { conversionResults: { maxBytes: 300 } } });
			const parser = new Parser(), parse = vi.spyOn(parser, 'parse');
			const source = new Q('1 m', undefined, parser);
			source.to('m');

			for (const text of [' m ', `1${' '.repeat(300)}m`])
			{
				parse.mockClear();
				expect(source.to(text)).toBe(source);
				expect(source.to(text)).toBe(source);
				expect(parse).toHaveBeenCalledTimes(2);
			}
			parse.mockClear();
			expect(source.to('m')).toBe(source);
			expect(parse).not.toHaveBeenCalled();
			source.to('meter'); // Each fits separately; the byte budget cannot hold both.
			parse.mockClear();
			expect(source.to('meter')).toBe(source);
			expect(parse).not.toHaveBeenCalled();
			expect(source.to('m')).toBe(source);
			expect(parse).toHaveBeenCalledTimes(1);
		});

		it('does not cache identities when caching is disabled', () => {
			for (const conversionCache of [{ maxEntries: 0 }, { maxBytes: 0 }])
			{
				const Q = Entry.withConfig({ cache: { conversionResults: conversionCache } });
				const parser = new Parser(), parse = vi.spyOn(parser, 'parse');
				const source = new Q('1 m', undefined, parser);
				parse.mockClear();
				expect(source.to('m')).toBe(source);
				expect(source.to('m')).toBe(source);
				expect(parse).toHaveBeenCalledTimes(2);
			}
		});

		it('keeps isolated conversion identities when global Decimal settings change', () => {
			const parser = new Parser(), parse = vi.spyOn(parser, 'parse');
			const source = new Entry('1 m', undefined, parser);
			const Isolated = Entry.withConfig({ numeric: { precision: 12 } });
			const isolated = new Isolated('1 m', undefined, parser);
			source.to('m');
			isolated.to('m');
			Decimal.config = { precision: Decimal.config.precision === 6 ? 7 : 6 };
			parse.mockClear();
			expect(isolated.to('m')).toBe(isolated);
			expect(parse).not.toHaveBeenCalled();
			expect(source.to('m')).toBe(source);
			expect(source.to('m')).toBe(source);
			expect(parse).not.toHaveBeenCalled();
		});

		it('never caches failed parsing or incompatible conversions', () => {
			const parser = new Parser(), parse = vi.spyOn(parser, 'parse');
			const source = new Entry('1 m', undefined, parser);

			for (const expression of ['m/', 's'])
			{
				parse.mockClear();
				expect(() => source.to(expression)).toThrow();
				expect(() => source.to(expression)).toThrow();
				expect(parse).toHaveBeenCalledTimes(2);
			}
		});

		it('uses custom parser results rather than comparing input with formatted units', () => {
			const delegate = new Parser();
			const parse = vi.fn((text, Numeric) => delegate.parse(
				text === 'm' ? 'cm' : text === 'same' ? 'm' : text, Numeric));
			const source = new Entry('1 meter', undefined, { parse });
			expect(source.units()).toBe('m');
			const converted = source.to('m');
			expect(converted.scalar.toString()).toBe('100');
			expect(converted).not.toBe(source);
			expect(source.to('same')).toBe(source);
			parse.mockClear();
			expect(source.to('same')).toBe(source);
			expect(source.to('m')).toBe(converted);
			expect(parse).not.toHaveBeenCalled();
		});
	});
}
