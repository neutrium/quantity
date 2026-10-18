import { describe, it, expect } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity as DecimalQuantity } from '../dist/Quantity.js';
import { Quantity as NumberQuantity } from '../dist/number.js';
import { createQuantityClass, isQuantity, Quantity as SharedQuantity } from '../dist/factory.js';
import { NumberAdapter } from '@neutrium/utilities/number';
const numberAdapter = new NumberAdapter();
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const decimalAdapter = new DecimalScientificAdapter();
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';

class Box
{
	constructor(value) { this.value = value; Object.freeze(this); }
}

const unbox = value => value instanceof Box ? value.value : numberAdapter.from(value);
const boxedAdapter = Object.freeze({
	id: 'boxed', tier: 'arithmetic', config: Object.freeze({}),
	isValue: value => value instanceof Box,
	from: value => value instanceof Box ? value : new Box(unbox(value)),
	add: (a, b) => new Box(a.value + b.value),
	sub: (a, b) => new Box(a.value - b.value),
	mul: (a, b) => new Box(a.value * b.value),
	div: (a, b) => new Box(a.value / b.value),
	neg: a => new Box(-a.value),
	rem: (a,b) => new Box(a.value % b.value),
	...Object.fromEntries(['abs', 'floor', 'ceil', 'trunc', 'round'].map(op => [op, a => new Box(numberAdapter[op](a.value))])),
	isNaN: a => Number.isNaN(a.value), isInteger: a => Number.isInteger(a.value),
	compare: (a, b) => numberAdapter.compare(a.value, b.value),
	isFinite: a => Number.isFinite(a.value),
	powInteger: (a, exponent) => new Box(numberAdapter.powInteger(a.value, exponent)),
	toBytes: () => Infinity,
	toNumber: a => a.value,
	toString: a => String(a.value),
});

for (const [name, numeric, value] of [
	['number', numberAdapter, scalar => scalar],
	['custom object', boxedAdapter, scalar => scalar.value],
	['decimal', decimalAdapter, scalar => scalar.toNumber()],
]) {
	for (const Parser of [NearleyParser, RegexParser])
	{
		describe(name + ' with ' + Parser.name, () => {
			const Q = createQuantityClass({ numeric, parser: config => new Parser(config) });
			it('preserves the selected scalar type through arithmetic and conversions', () => {
				const q = new Q('1 km').add('500 m').sub('250 m').to('m');
				expect(value(q.scalar)).toBe(1250);
				expect(q).toBeInstanceOf(Q);
				expect(numeric.isValue(q.scalar)).toBe(true);
				expect(value(q.mul(2).div(5).scalar)).toBe(500);
				expect(value(new Q('2 m').pow(3).scalar)).toBe(8);
				expect(new Q('2 m').pow(-2).units()).toBe('1/m2');
				expect(value(new Q('2 s').inverse().scalar)).toBe(0.5);
				expect(value(new Q('2 s').to('1/s').scalar)).toBe(0.5);
				expect(value(new Q('36 km/h').toBase().scalar)).toBeCloseTo(10);
				expect(value(new Q('2 m').mul('3 cm').scalar)).toBeCloseTo(0.06);
				expect(new Q('2 m').div('50 cm').isUnitless()).toBe(true);
				expect(value(new Q('2 m').div('50 cm').scalar)).toBe(4);
				expect(new Q('2 m').compareTo('200 cm')).toBe(0);
				expect(new Q('2 m').lt('3 m')).toBe(true);
				expect(new Q('2 m').compareTo(2)).toBe(0);
				expect(isQuantity(q)).toBe(true);
				expect(q).toBeInstanceOf(SharedQuantity);
			});
			it('keeps temperature offsets and interval arithmetic', () => {
				expect(value(new Q('32 tempF').to('tempC').scalar)).toBeCloseTo(0);
				expect(value(new Q('20 tempC').to('K').scalar)).toBeCloseTo(20);
				expect(value(new Q('273.15 K').to('tempC').scalar)).toBeCloseTo(0);
				expect(value(new Q('20 tempC').toBase().scalar)).toBeCloseTo(293.15);
				expect(value(new Q('20 tempC').add('18 degF').scalar)).toBeCloseTo(30);
				expect(value(new Q('18 degF').add('20 tempC').scalar)).toBeCloseTo(30);
				expect(value(new Q('20 tempC').sub('32 tempF').scalar)).toBeCloseTo(20);
				expect(new Q('20 tempC').sub('32 tempF').units()).toBe('degC');
				expect(() => new Q('-274 tempC')).toThrow();
				expect(() => new Q('20 tempC').add('10 tempC')).toThrow();
				expect(() => new Q('20 tempC').inverse()).toThrow();
				expect(() => new Q('20 tempC').mul('2 m')).toThrow();
			});
			it('validates units and powers independently of backend precision', () => {
				for (const exponent of ['0.5', '1e-1000', '1.00000000000000000001', Number.MAX_SAFE_INTEGER + 1]) {
					expect(() => new Q('1 m').pow(exponent)).toThrow();
				}
				expect(() => new Q('1 m').add('1 s')).toThrow();
				expect(() => new Q('0 m').inverse()).toThrow();
				expect(() => new Q('0 m').to('1/m')).toThrow();
				expect(() => new Q({ scalar: '1', numerator: [], denominator: [] })).toThrow();
			});
			it('retains backend, parser and cache settings on derived values', () => {
				const Configured = Q.withConfig({ cache: { parser: { maxEntries: 2 }, conversionResults: { maxEntries: 2 } } });
				const q = new Configured(numeric.from('2'), 'm');
				expect(q.clone().numeric).toBe(q.numeric);
				if (numeric === boxedAdapter) expect(q.to('cm').scalar.value).toBe(q.to('cm').scalar.value);
				else expect(q.to('cm')).toBe(q.to('cm'));
				expect(q.add('1 m')).toBeInstanceOf(Configured);
				expect(q.parserConfig.cache.maxEntries).toBe(2);
				expect(q.to('cm').conversionCacheConfig.maxEntries).toBe(2);
				expect(() => { q.numeric = numberAdapter; }).toThrow();
			});
		});
	}
}

describe('numeric backend boundaries', () => {
	it('keeps Decimal + Nearley as the default', () => {
		expect(new DecimalQuantity('1 m')).toBeInstanceOf(SharedQuantity);
		expect(new NumberQuantity('1 m')).toBeInstanceOf(SharedQuantity);
		expect(new DecimalQuantity('(2 m)/(4 s)').scalar).toBeInstanceOf(Decimal);
		expect(new DecimalQuantity('0.1').add('0.2').scalar.toString()).toBe('0.3');
		expect(new NumberQuantity('0.1').add('0.2').scalar).toBe(0.1 + 0.2);
	});
	it('rejects mixed backend arithmetic but allows explicit construction', () => {
		const d = new DecimalQuantity('2 m'), n = new NumberQuantity('2 m');
		for (const [a, b] of [[d, n], [n, d]]) {
			for (const method of ['add', 'sub', 'mul', 'div', 'compareTo']) {
				expect(() => a[method](b)).toThrow(/numeric backends/);
			}
			expect(a.createQuantity(b).same(a)).toBe(true);
		}
	});
	it('evaluates cached parser expressions using the current adapter', () => {
		const parser = new NearleyParser();
		expect(parser.parse('(2 m)/(4 s)', numberAdapter).scalar).toBe(0.5);
		expect(parser.parse('(2 m)/(4 s)', boxedAdapter).scalar).toBeInstanceOf(Box);
		expect(parser.parse('(2 m)/(4 s)', decimalAdapter).scalar.toString()).toBe('0.5');
		expect(() => parser.parse('m/0', numberAdapter)).toThrow();
	});
	it('supports isolated Decimal configuration through the adapter factory', () => {
		const Q = createQuantityClass({ numeric: new DecimalScientificAdapter({ precision: 8 }), parser: c => new NearleyParser(c) });
		const Low = Q.withConfig({ numeric: { precision: 3 } });
		expect(new Q(1).div(3).scalar.toString()).toBe('0.33333333');
		expect(new Low(1).div(3).scalar.toString()).toBe('0.333');
		expect(() => NumberQuantity.withConfig({ numeric: { precision: 3 } })).toThrow(/fixed precision/);
	});
	it('keeps IEEE-754 nonfinite and comparison behavior', () => {
		expect(new NumberQuantity(NaN).compareTo(NaN)).toBeUndefined();
		expect(new NumberQuantity(Infinity).eq(Infinity)).toBe(true);
		expect(new NumberQuantity(1).div(0).scalar).toBe(Infinity);
		expect(new NumberQuantity(-0).scalar).toBe(-0);
	});
	it('rejects malformed scalar and parser inputs', () => {
		for (const input of [null, true, {}, [], '0x10', '']) {
			expect(() => new NumberQuantity(input)).toThrow();
		}
		expect(() => new NumberQuantity(1, undefined, null)).toThrow(/parser/);
	});
});
