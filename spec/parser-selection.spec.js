import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
const testNumeric = new DecimalScientificAdapter();
import { describe, expect, it } from 'vitest';
import { Quantity } from '@neutrium/quantity';
import { Quantity as NumberQuantity } from '@neutrium/quantity/number';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { createQuantityClass } from '@neutrium/quantity/factory';
import { NearleyParser } from '@neutrium/quantity/parsers/nearley';
import { RegexParser } from '@neutrium/quantity/parsers/regex';
import { isQuantity } from '@neutrium/quantity/guards.js';

describe('parser selection', () => {
	it.each([['Decimal', Quantity], ['number', NumberQuantity]])('uses Pratt by default and accepts an explicit Nearley parser for %s', (_, Q) => {
		const atLimit = '('.repeat(255) + 'm' + ')'.repeat(255);
		const beyondLimit = '(' + atLimit + ')';
		expect(new Q(atLimit).units()).toBe('m');
		expect(() => new Q(beyondLimit)).toThrow(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }));
		expect(new Q(beyondLimit, undefined, new NearleyParser()).units()).toBe('m');
	});

	it('exposes a regex-only entry', () => {
		expect(() => new RegexQuantity('2 (m/s)^2')).toThrow();
		expect(new RegexQuantity('1e3 m').scalar.toString()).toBe('1000');
	});

	it('retains a custom parser through operations and cached base conversions', () => {
		const regex = new RegexParser();
		let factories = 0;
		const Custom = createQuantityClass({ numeric: testNumeric, parser: () => {
			factories++;
			return { parse: text => regex.parse(text.replaceAll('metres', 'm'), testNumeric) };
		} });
		// Warm the shared cache using a different configured class first.
		new Quantity('1 cm').toBase();
		const q = new Custom('200 cm');
		const results = [q.clone(), q.toBase(), q.to('metres'), q.add('1 metres'),
			q.sub('1 metres'), q.mul(2), q.div(2), q.pow(2).pow(1), q.inverse().inverse()];
		expect(factories).toBe(1);
		for (const result of results)
		{
			expect(result).toBeInstanceOf(Custom);
			expect(isQuantity(result)).toBe(true);
		}
		expect(q.clone().toBase().add('1 metres').eq('3 metres')).toBe(true);
		expect(q.lt('3 metres')).toBe(true);
		expect(q.isCompatible('metres')).toBe(true);
		expect(q.mul('2 metres').to('metres2').scalar.toString()).toBe('4');
		expect(q.div('2 metres').scalar.toString()).toBe('1');
		expect(q.isInverse('metres^-1')).toBe(true);
		const temperature = new Custom('20 tempC');

		for (const result of [temperature.toBase(), temperature.to('tempF'),
			temperature.add('2 degC'), temperature.sub('10 tempC'), temperature.to('degC')])
		{
			expect(result).toBeInstanceOf(Custom);
			expect(result.mul('1').clone()).toBeInstanceOf(Custom);
		}
	});

	it('supports cross-entry operands and the existing third-argument override', () => {
		const a = new Quantity('1 m');
		const b = new RegexQuantity('100 cm');
		expect(a.eq(b)).toBe(true);
		expect(a.add(b)).toBeInstanceOf(Quantity);
		expect(b.add(a)).toBeInstanceOf(RegexQuantity);
		const q = new Quantity('1e3 m', undefined, new RegexParser());
		expect(q.clone().add('1e3 m').scalar.toString()).toBe('2000');
	});
});
