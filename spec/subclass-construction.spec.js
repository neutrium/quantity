import { describe, expect, it } from 'vitest';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { createQuantityClass } from '@neutrium/quantity/core';
import { RegexQtyParser } from '@neutrium/quantity/parsers/regex';

const CustomQuantity = createQuantityClass(config => new RegexQtyParser(config));

for (const [name, Entry] of [['Nearley', Quantity], ['Regex', RegexQuantity], ['custom factory', CustomQuantity]]) {
	describe(`subclass construction: ${name}`, () => {
		class Labelled extends Entry {
			#options;
			constructor(input, options, units, parser) {
				super(input, units, parser);
				// Read a required argument: a declaration-only test would miss failures here.
				this.label = options.label;
				this.#options = options;
			}
			constructQuantity(input, units, parser) {
				return new this.constructor(input, this.#options, units, parser);
			}
		}

		it('preserves required state and configured classes across operands and results', () => {
			const Q = Labelled.withConfig({ precision: 6, rounding: 'down',
				parser: { cache: { maxEntries: 7 } }, conversionCache: { maxEntries: 3 } })
				.withConfig({ precision: 8 });
			const q = new Q('2 m', { label: 'length' });
			const cases = [
				[q.clone(), '2', 'm'],
				[q.to('cm'), '200', 'cm'],
				[q.to(new Entry('cm')), '200', 'cm'],
				[q.add('1 m'), '3', 'm'],
				[q.sub('50 cm'), '1.5', 'm'],
				[q.mul(2), '4', 'm'],
				[q.div(2), '1', 'm'],
				[q.mul('3 s'), '6', 'm*s'],
				[q.div('2 s'), '1', 'm/s'],
				[q.pow(2), '4', 'm2'],
				[q.inverse(), '0.5', '1/m'],
				[new Q('200 cm', { label: 'length' }).toBase(), '2', 'm'],
			];
			for (const [result, scalar, units] of cases) {
				expect(result).toBeInstanceOf(Q);
				expect(result.label).toBe('length');
				expect(result.scalar.toString()).toBe(scalar);
				expect(result.units()).toBe(units);
				expect(result.config).toBe(Q.config);
				expect(result.parserConfig).toBe(Q.parserConfig);
				expect(result.conversionCacheConfig).toBe(Q.conversionCacheConfig);
			}
			expect(q.eq('200 cm')).toBe(true);
			expect(q.lt('3 m')).toBe(true);
			expect(q.isCompatible('cm')).toBe(true);
			expect(q.isInverse('/m')).toBe(true);
			expect(q.div(3).scalar.toString()).toBe('0.66666666');
		});

		it('forwards the original parser, including overrides, without reparsing definitions', () => {
			let calls = 0;
			const parser = new RegexQtyParser({ cache: { maxEntries: 1 } });
			const override = { config: parser.config, parse(text, Numeric) {
				calls++;
				return parser.parse(text.replaceAll('length-unit', 'm'), Numeric);
			} };
			const q = new Labelled('2 length-unit', { label: 'override' }, undefined, override);
			expect(calls).toBe(1);
			for (const result of [q.clone(), q.mul(2), q.inverse(), q.pow(2)]) {
				expect(result.label).toBe('override');
				expect(result.parserConfig).toBe(override.config);
			}
			expect(calls).toBe(1);
			expect(q.clone().add('1 length-unit').scalar.toString()).toBe('3');
			expect(q.to('cm').to('length-unit').scalar.toString()).toBe('2');
			expect(q.to('cm').label).toBe('override');
		});

		it('retains state across temperature-specific result paths', () => {
			const Q = Labelled.withConfig({ precision: 12 });
			const q = new Q('20 tempC', { label: 'temperature' });
			const cases = [
				[q.to('tempF'), '68'], [q.toBase(), '293.15'],
				[q.add('2 degC'), '22'], [q.sub('10 tempC'), '10'],
				[q.to('degC'), '20'], [q.mul(2), '40'],
			];
			for (const [result, scalar] of cases) {
				expect(result).toBeInstanceOf(Q);
				expect(result.label).toBe('temperature');
				expect(result.scalar.toString()).toBe(scalar);
			}
		});

		it('keeps the default hook working for constructor-compatible subclasses', () => {
			class Compatible extends Entry { identify() { return 'compatible'; } }
			const Q = Compatible.withConfig({ precision: 12 });
			const q = new Q('1 m');
			for (const result of [q.clone(), q.to('cm'), q.add('1 m')]) {
				expect(result).toBeInstanceOf(Q);
				expect(result.identify()).toBe('compatible');
			}
		});
	});
}

it('does not call the custom parser factory again for subclass operands or results', () => {
	let factories = 0;
	const Base = createQuantityClass(config => { factories++; return new RegexQtyParser(config); });
	class Labelled extends Base {
		constructor(input, options, units, parser) {
			super(input, units, parser);
			this.options = options;
			this.label = options.label;
		}
		constructQuantity(input, units, parser) {
			return new this.constructor(input, this.options, units, parser);
		}
	}
	const Q = Labelled.withConfig({ precision: 8 });
	const q = new Q('1 m', { label: 'length' });
	expect(q.clone().add('2 m').to('cm').label).toBe('length');
	expect(factories).toBe(1);
});
