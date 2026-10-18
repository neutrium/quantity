import { overrideAdapter } from './helpers/numeric.js';
import { describe, it, expect } from 'vitest';
import { NumberAdapter } from '@neutrium/utilities/number';
const numberAdapter = new NumberAdapter();
import { floatAdapter } from './helpers/numeric.js';
import { DecimalArithmeticAdapter } from '@neutrium/utilities/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
import { DecimalCoreAdapter } from '@neutrium/utilities/decimal/core';
const coreDecimal = new DecimalCoreAdapter();
import { createQuantityClass } from '../dist/factory.js';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';

const configure = numeric => createQuantityClass({ numeric, parser: c => new NearleyParser(c) });

for (const [name, numeric] of [
	['double', numberAdapter],
	['Decimal arithmetic', new DecimalArithmeticAdapter({ precision: 30 })],
	['Decimal scientific', new DecimalScientificAdapter({ precision: 30 })],
]) {
	describe('unmodified utilities adapter: ' + name, () => {
		const Q = configure(numeric);
		it('parses, calculates and converts using the supplied scalar representation', () => {
			const q = new Q('1 km').add('500 m').to('m');
			expect(q.numeric).toBe(numeric);
			expect(numeric.isValue(q.scalar)).toBe(true);
			expect(numeric.toNumber(q.scalar)).toBe(1500);
			expect(numeric.toNumber(q.div(3).scalar)).toBe(500);
			expect(numeric.toNumber(new Q({ toString: () => '2' }, 'm').scalar)).toBe(2);
			expect(() => new Q({ toString: () => 2 })).toThrow();
			expect(q.to('cm')).toBe(q.to('cm'));
			expect(q.clone()).toBeInstanceOf(Q);
		});
		it('supports integer powers and validates exponents before numeric conversion', () => {
			expect(numeric.toNumber(new Q('2 m').pow(3).scalar)).toBe(8);
			expect(numeric.toNumber(new Q('2 m').pow(-2).scalar)).toBe(0.25);
			expect(numeric.toNumber(new Q('(2 m)^3').scalar)).toBe(8);
			for (const exponent of ['1e-10000', '1.00000000000000000001', '9007199254740992']) {
				expect(() => new Q('1 m').pow(exponent)).toThrow();
			}
		});
		it('preserves Quantity validation and works with the Regex parser', () => {
			expect(() => new Q('1 m').add('1 s')).toThrow('Incompatible units');
			expect(() => new Q('20 tempC').add('10 tempC')).toThrow('Cannot add two temperatures');
			expect(() => new Q('-1 tempK')).toThrow('absolute zero');
			const Regex = createQuantityClass({ numeric, parser: c => new RegexParser(c) });
			expect(numeric.toNumber(new Regex('36 km/h').to('m/s').scalar)).toBeCloseTo(10, 4);
		});
	});
}

it('selects float32, double and Decimal arithmetic without Quantity adapter wrappers', () => {
	const Float = configure(floatAdapter), Double = configure(numberAdapter), Decimal = configure(new DecimalArithmeticAdapter());
	expect(new Float(16777216).add(1).scalar).toBe(16777216);
	expect(new Double(16777216).add(1).scalar).toBe(16777217);
	expect(new Decimal('0.1').add('0.2').scalar.toString()).toBe('0.3');
	expect(() => new Float(1).add(new Double(1))).toThrow('Cannot mix numeric backends');
});

it('supports utilities Decimal configuration and arithmetic-tier integer powers', () => {
	const Q = configure(new DecimalArithmeticAdapter({ precision: 12 }));
	const Low = Q.withConfig({ numeric: { precision: 3 }, cache: { parser: { maxEntries: 2 } } });
	expect(new Q(1).div(3).scalar.toString()).toBe('0.333333333333');
	expect(new Low(1).div(3).scalar.toString()).toBe('0.333');
	expect(new Low('2 m').pow(3).scalar.toString()).toBe('8');
	expect(new Low('2 m').to('cm').parserConfig.cache.maxEntries).toBe(2);
});

it('does not let cache size estimation fail a conversion when scalar formatting is restricted', () => {
	const Q = configure(new DecimalArithmeticAdapter({ precision: 100, maxOutputDigits: 5 }));
	const q = new Q('123456789 m');
	expect(q.to('cm').scalar.eq('12345678900')).toBe(true);
});

it('requires arithmetic capabilities and rejects a core-only adapter at factory creation', () => {
	expect(() => configure(coreDecimal)).toThrow(/arithmetic numeric adapter.*add/);
});

it('requires the new power and size methods when accepting a custom adapter', () => {
	for (const method of ['powInteger', 'toBytes'])
	{
		const numeric = overrideAdapter(numberAdapter, { [method]: undefined });
		expect(() => configure(numeric)).toThrow('missing ' + method);
	}
});
