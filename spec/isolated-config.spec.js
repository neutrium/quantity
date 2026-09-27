import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { createQuantityClass } from '@neutrium/quantity/core';
import { RegexQtyParser } from '@neutrium/quantity/parsers/regex';


for (const Entry of [Quantity, RegexQuantity]) {
	describe(`isolated config: ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {
		it('snapshots settings without mutating the shared Decimal or caller object', () => {
			const options = { precision: 6, rounding: 'down' };
			const Configured = Entry.withConfig(options);
			const source = new Configured('1 degF');
			const cached = source.to('degC');
			options.precision = 2;
			Decimal.config = { precision: 2, rounding: 'up', maxE: 2, minE: -2 };
			expect(Configured.config.precision).toBe(6);
			expect(Object.isFrozen(Configured.config)).toBe(true);
			expect(source.to('degC')).toBe(cached);
			expect(cached.scalar.toString()).toBe('0.555555');
			expect(new Configured('1e30 m').scalar.toString()).toBe('1e+30');
			expect(new Configured('1e-30 m').scalar.toString()).toBe('1e-30');
			expect(new Configured('1 tempF').to('tempC').scalar.toString()).toBe('-17.2222');
			expect(() => { source.scalar.constructor.config = { precision: 3 }; }).toThrow('configuration is fixed');
			expect(Decimal.config.precision).toBe(2);
		});

		it('inherits the parser and configuration in copies, arithmetic, and chained classes', () => {
			const Low = Entry.withConfig({ precision: 6 });
			const High = Low.withConfig({ precision: 30 });
			const q = new Low('1 m');
			for (const result of [q.clone(), q.add('2 m'), q.sub('2 m'), q.mul(2), q.div(3), q.pow(2), q.inverse(), q.to('cm')]) {
				expect(result).toBeInstanceOf(Low);
				expect(result.config).toBe(Low.config);
			}
			expect(new Low('1 m').div(3).scalar.toString()).toBe('0.333333');
			expect(new High('1 m').div(3).scalar.toString()).toBe('0.' + '3'.repeat(30));
			expect(High.config.precision).toBe(30);
			expect(Low.config.precision).toBe(6);
			if (Entry === RegexQuantity) expect(() => new Low('(m)')).toThrow();
			else expect(new Low('(m)').units()).toBe('m');
		});

		it('uses the receiver context across different classes and Decimal inputs', () => {
			const Low = Entry.withConfig({ precision: 6, rounding: 'down' });
			const High = Entry.withConfig({ precision: 30, rounding: 'up' });
			const value = new High('1.23456789 cm');
			expect(new Low('1 m').add(value).scalar.toString()).toBe('1.01234');
			expect(new Low('1 m').sub(value).scalar.toString()).toBe('0.987654');
			expect(new Low('1 m').mul(value).scalar.toString()).toBe('0.0123456');
			expect(new High('1 m').add(new Low('1.23456789 cm')).scalar.toString()).toBe('1.0123456789');
			expect(new Low(new Decimal('1.23456789'), 'm').mul(1).scalar.toString()).toBe('1.23456');
			const temp = new High('20 tempC');
			const result = new Low('1.23456789 degF').add(temp);
			expect(result).toBeInstanceOf(Low);
			expect(result.config).toBe(Low.config);
			expect(result.scalar.toString()).toBe('20.6858');
		});

		it('keeps caches independent when low and high precision are interleaved', () => {
			const Low = Entry.withConfig({ precision: 6, rounding: 'down' });
			const High = Entry.withConfig({ precision: 30, rounding: 'up' });
			const low = new Low('1 m/h'), high = new High('1 m/h');
			const a = low.to('ft/min'), b = high.to('ft/min');
			for (let i = 0; i < 4; i++) {
				expect(low.to('ft/min')).toBe(a);
				expect(high.to('ft/min')).toBe(b);
				expect(new Low('1 m/h').baseScalar.toString()).toBe(low.baseScalar.toString());
				expect(new High('1 m/h').baseScalar.toString()).toBe(high.baseScalar.toString());
			}
			expect(a.scalar.toString()).not.toBe(b.scalar.toString());
		});

		it('validates settings and preserves nonfinite numeric comparison behaviour', () => {
			expect(() => Entry.withConfig({ precision: 0 })).toThrow();
			expect(() => Entry.withConfig({ rounding: 'unknown' })).toThrow();
			const Configured = Entry.withConfig({ precision: 6 });
			const make = scalar => new Configured({ scalar: new Decimal(scalar), numerator: [{ unit: '<meter>', exponent: 1 }], denominator: [] });
			expect(make(NaN).eq(make(NaN))).toBe(false);
			expect(make(Infinity).compareTo(make(Infinity))).toBe(0);
			expect(make(-Infinity).lt(make(0))).toBe(true);
			expect(make(1).eq(1)).toBe(true);
		});
	});
}

it('passes context to custom parsers and preserves their class', () => {
	const seen = [];
	const parser = new RegexQtyParser();
	const Custom = createQuantityClass(() => ({ parse(text, Numeric) {
		seen.push(Numeric.config.precision);
		return parser.parse(text, Numeric);
	} })).withConfig({ precision: 7 });
	const quantity = new Custom('1 m');
	expect(quantity.to('cm')).toBeInstanceOf(Custom);
	expect(seen).toEqual([7, 7]);
	expect(quantity.div(3).scalar.toString()).toBe('0.3333333');
});

it('evaluates Nearley scalar expressions in the isolated context on cache misses and hits', () => {
	const Low = Quantity.withConfig({ precision: 6, rounding: 'down' });
	const High = Quantity.withConfig({ precision: 30, rounding: 'up' });
	Decimal.config = { precision: 2, maxE: 2, minE: -2 };
	for (let i = 0; i < 2; i++) {
		expect(new Low('(1/3) m').scalar.toString()).toBe('0.333333');
		expect(new High('(1/3) m').scalar.toString()).toBe('0.' + '3'.repeat(29) + '4');
		expect(new High('1e30 * 2 m').scalar.toString()).toBe('2e+30');
	}
});
