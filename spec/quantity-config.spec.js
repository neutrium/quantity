import { describe, expect, it, vi } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { createQuantityClass } from '../dist/factory.js';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const decimalAdapter = new DecimalScientificAdapter();
import { NumberAdapter } from '@neutrium/utilities/number';
const numberAdapter = new NumberAdapter();
import { DecimalArithmeticAdapter } from '@neutrium/utilities/decimal/arithmetic';
import { BudgetCache } from '@neutrium/utilities/cache';
import { CacheScope } from '../dist/utils/CacheScope.js';

it('accepts the same nested settings in the factory and withConfig', () => {
	const input = { numeric: { precision: 6, rounding: 'down' }, cache: { parser: { maxEntries: 3 }, scalarTerms: false } };
	const Q = createQuantityClass({ numeric: decimalAdapter, parser: c => new NearleyParser(c), config: input });
	const Other = Quantity.withConfig(input);
	expect(Q.config).toEqual(Other.config);
	expect(Q.config.numeric.precision).toBe(6);
	expect(Q.config.cache.parser.maxEntries).toBe(3);
	expect(Q.config.cache.scalarTerms).toBe(false);
	input.numeric.precision = 2;
	input.cache.parser.maxEntries = 0;
	const q = new Q('1 m');
	expect(q.div(3).scalar.toString()).toBe('0.333333');
	expect(q.config).toBe(Q.config);
	expect(q.clone().config).toBe(Q.config);
	expect(Object.isFrozen(Q.config)).toBe(true);
	expect(Object.isFrozen(Q.config.numeric)).toBe(true);
	expect(Object.isFrozen(Q.config.cache)).toBe(true);
	expect(Object.isFrozen(Q.config.cache.parser)).toBe(true);
});

it('merges nested settings, resets defaults explicitly, and keeps cache changes independent of the backend', () => {
	const Parent = Quantity.withConfig({ numeric: { precision: 7 }, cache: { parser: { maxEntries: 3, maxBytes: 4000 } } });
	const Child = Parent.withConfig({ numeric: { rounding: 'down' }, cache: { parser: { maxBytes: 2000 } } });
	expect(Child.config.numeric.precision).toBe(7);
	expect(Child.config.cache.parser).toEqual({ maxEntries: 3, maxBytes: 2000 });
	expect(Parent.config.cache.parser.maxBytes).toBe(4000);
	const Off = Parent.withConfig({ cache: false }), Selective = Off.withConfig({ cache: { scalarTerms: true, parser: true } });
	expect(new Off(1).numeric).toBe(new Parent(1).numeric);
	expect(Selective.config.cache.scalarTerms).toBe(true);
	expect(Selective.config.cache.metadata).toBe(false);
	expect(Selective.config.cache.parser).toEqual(Quantity.config.cache.parser);
	expect(Selective.config.cache.conversionResults.maxEntries).toBe(0);
	expect(Off.withConfig({ cache: true }).config.cache).toEqual(Quantity.config.cache);
	expect(new Off(1).cacheScope).not.toBe(new Parent(1).cacheScope);
});

it('rejects unknown namespaces, misspelled limits and invalid weak-cache settings', () => {
	for (const config of [
		{ precision: 6 }, { parser: {} }, { conversionCache: {} }, { cache: null }, { numeric: null },
		{ cache: { missing: false } }, { cache: { parser: { maxByte: 2 } } },
		{ cache: { scalarTerms: { maxEntries: 2 } } }, { cache: { metadata: 0 } },
		{ cache: { unitFactors: { maxEntries: -1 } } }, { numeric: { missing: 1 } },
	]) expect(() => Quantity.withConfig(config)).toThrow();
});

it('reuses inherited validated cache limits while keeping explicit overrides isolated', () => {
	const Parent = Quantity.withConfig({ cache: { parser: { maxEntries: 3 }, unitFactors: { maxEntries: 7 } } });
	const Child = Parent.withConfig({ cache: { conversionResults: { maxEntries: 2 } } });
	for (const family of ['parser', 'unitFactors', 'conversionPlans'])
		expect(Child.config.cache[family]).toBe(Parent.config.cache[family]);
	expect(Child.parserConfig.cache).toBe(Child.config.cache.parser);
	const Explicit = Parent.withConfig({ cache: { parser: { maxEntries: 3 } } });
	expect(Explicit.config.cache.parser).toEqual(Parent.config.cache.parser);
	expect(Explicit.config.cache.parser).not.toBe(Parent.config.cache.parser);
	const Disabled = Parent.withConfig({ cache: false });
	const Partial = Disabled.withConfig({ cache: { parser: true } });
	expect(Partial.config.cache.unitFactors).toBe(Disabled.config.cache.unitFactors);
});

for (const Parser of [NearleyParser, RegexParser])
{
	for (const numeric of [decimalAdapter, numberAdapter, new DecimalArithmeticAdapter({ precision: 6, minE: -20, maxE: 20 })])
	{
		describe(`cache modes: ${Parser.name}, ${numeric.id}`, () => {
			const Cached = createQuantityClass({ numeric, parser: c => new Parser(c) });
			const Uncached = Cached.withConfig({ cache: false });
			const MetadataOff = Cached.withConfig({ cache: { metadata: false } });
			function results(Q) {
				const speed = new Q('36 km/h'), target = new Q('1 m/s');
				const temp = new Q('20 tempC');
				return [speed.to(target), speed.toBase(), speed.add(target), speed.sub(target), speed.mul(target),
					speed.div(target), speed.pow(-2), temp.add('1 degF'), temp.to('tempF'), temp.sub('68 tempF'),
					new Q('0 tempK').pow(1), new Q('-273.15 tempC').mul(0.5)]
					.map(q => [q.scalar.toString(), q.units()])
					.concat([[speed.compareTo(target), speed.same(new Q('36 km/h'))], [speed.baseScalar.toString()]])
					.concat(['1', '1/s', '1 kg/m/s', '0 cm'].map(input => {
						const q = new Q(input);
						const read = () => [q.isBase(), q.units(), q.baseScalar.toString(), q.toBase().units()];
						return [read(), read()];
					}));
			}
			it('preserves results, validation, final rounding and absolute-zero rules', () => {
				expect(results(Uncached)).toEqual(results(Cached));
				expect(results(MetadataOff)).toEqual(results(Cached));
				for (const Q of [Cached, Uncached, MetadataOff]) {
					expect(() => new Q('1 m').add('1 s')).toThrow('Incompatible units');
					expect(() => new Q('-274 tempC')).toThrow('absolute zero');
					expect(() => new Q('0 m').inverse()).toThrow('Divide by zero');
					expect(() => new Q('1 tempC').add('1 tempF')).toThrow('Cannot add two temperatures');
					expect(() => new Q('1 m').to('s')).toThrow('Incompatible units');
				}
			});
			it('bypasses cache lookup and storage even after the enabled class is warm', () => {
				results(Cached);
				const read = vi.spyOn(BudgetCache.prototype, 'get'), write = vi.spyOn(BudgetCache.prototype, 'set');
				const stores = vi.spyOn(CacheScope.prototype, 'get');
				try {
					results(Uncached);
					const override = new Parser();
					const value = new Uncached('36 km/h', undefined, override);
					expect(value.to('m/s')).not.toBe(value.to('m/s'));
					expect(value.to('km/h')).toBe(value);
					expect(override.cacheStats.entries).toBe(0);
					expect(read).not.toHaveBeenCalled();
					expect(write).not.toHaveBeenCalled();
					expect(stores.mock.results.every(result => result.value === undefined)).toBe(true);
				} finally { read.mockRestore(); write.mockRestore(); stores.mockRestore(); }
				const value = new Cached('36 km/h');
				expect(value.to('m/s')).toBe(value.to('m/s'));
			});
			it('uses the receiver cache policy for mixed-class operands', () => {
				const temp = new Cached('20 tempC'), speed = new Cached('1 m/s');
				const a = new Uncached('1 degC'), b = new Uncached('36 km/h');
				const stores = vi.spyOn(CacheScope.prototype, 'get');
				try {
					expect(a.add(temp).scalar.toString()).toBe('21');
					expect(b.add(speed).scalar.toString()).toBe('39.6');
					expect(stores.mock.results.every(result => result.value === undefined)).toBe(true);
				} finally { stores.mockRestore(); }
			});
		});
	}
}

for (const Parser of [NearleyParser, RegexParser])
{
	it(`honors disabled token and expression retention on an explicit ${Parser.name}`, () => {
		const Q = createQuantityClass({ numeric: numberAdapter, parser: c => new Parser(c) });
		const parser = new Parser({ cache: { maxEntries: 0 } });
		const first = new Q('2 m', undefined, parser), second = new Q('3 m', undefined, parser);
		expect(first.numerator).toEqual(second.numerator);
		expect(first.numerator).not.toBe(second.numerator);
		expect(parser.cacheStats.entries).toBe(0);
	});
}
