import { overrideAdapter } from './helpers/numeric.js';
import { describe, expect, it, vi } from 'vitest';
import { NumberAdapter } from '@neutrium/utilities/number';
const numberAdapter = new NumberAdapter();
import { floatAdapter } from './helpers/numeric.js';
import { createQuantityClass } from '../dist/factory.js';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';

const noFormatting = () => { throw new Error('Calculation serialized a scalar'); };

for (const base of [numberAdapter, floatAdapter])
{
	for (const Parser of [NearleyParser, RegexParser]) {
		describe(`${base.id} arithmetic through ${Parser.name}`, () => {
			for (const cache of [true, false])
			{
				it(`keeps calculations numeric with caching ${cache ? 'enabled' : 'disabled'}`, () => {
					const toString = vi.fn(noFormatting);
					const numeric = overrideAdapter(base, { toString });
					const Q = createQuantityClass({ numeric, parser: c => new Parser(c), config: { cache } });
					const epsilon = base === numberAdapter ? 2 ** -52 : 2 ** -23;
					const q = new Q(1 + epsilon, 'm');
					expect(q.sub('100 cm').scalar).toBe(epsilon);
					expect(q.sub('100 cm').scalar).toBe(q.sub('1 m').scalar);
					expect(q.compareTo('100 cm')).toBe(1);
					expect(new Q('2 m').add('100 cm').scalar).toBe(3);
					expect(new Q('2 m').mul('50 cm').scalar).toBe(1);
					expect(new Q('2 m').div('50 cm').scalar).toBe(4);
					expect(new Q('2 m').to('cm').scalar).toBe(200);
					expect(new Q('2 cm').baseScalar).toBe(base.mul(2, base.from('0.01')));
					expect(new Q('2 m').to('1/cm').scalar).toBe(base.from('0.005'));
					expect(new Q('2 m').pow(-2).scalar).toBe(0.25);
					expect(new Q('2 m').inverse().scalar).toBe(0.5);
					expect(new Q('20 tempC').to('tempK').scalar).toBe(base.from('293.15'));
					expect(new Q('0 tempC').eq('273.15 degK')).toBe(true);
					expect(new Q('20 tempC').add('18 degF').scalar).toBe(30);
					expect(new Q('20 tempC').sub('10 tempC').scalar).toBe(10);
					expect(new Q('20 tempC').mul(2).scalar).toBe(40);
					expect(new Q('20 tempC').div(2).scalar).toBe(10);
					expect(new Q('0 tempK').pow(1).scalar).toBe(0);
					expect(() => new Q('0 tempK').sub('1 degK')).toThrow('absolute zero');
					const tiny = base === numberAdapter ? 5e-324 : Math.fround(1e-45);
					expect(() => new Q(tiny, 'tempK').mul(-0.5)).toThrow('absolute zero');
					expect(toString).not.toHaveBeenCalled();
				});
			}

			it('retains native intermediate rounding and overflow', () => {
				const Q = createQuantityClass({ numeric: base, parser: c => new Parser(c) });
				const extreme = base === numberAdapter ? 1e308 : base.from('1e38');
				// The intermediate product overflows even though exact arithmetic could return a finite result.
				expect(new Q(extreme, 'm').mul('10 mm').scalar).toBe(Infinity);
				const expected = base.sub(base.from(1), base.mul(base.from('100.0001'), base.from('0.01')));
				expect(new Q('1 m').sub('100.0001 cm').scalar).toBe(expected);
			});
		});
	}
}

it('evaluates a non-stringifiable custom representation entirely through its arithmetic adapter', () => {
	class Scalar
	{
		constructor(value)
		{
			this.value = value; Object.freeze(this);
		}

		toString = noFormatting;
	}
	const numeric = {
		id: 'custom', tier: 'arithmetic', config: {},
		from: value => value instanceof Scalar ? value : new Scalar(numberAdapter.from(value)),
		isValue: value => value instanceof Scalar,
		compare: (a, b) => numberAdapter.compare(a.value, b.value),
		isFinite: value => Number.isFinite(value.value),
		isInteger: value => Number.isInteger(value.value),
		isNaN: value => Number.isNaN(value.value),
		toNumber: value => value.value,
		toString: noFormatting,
		powInteger: (a, exponent) => new Scalar(numberAdapter.powInteger(a.value, exponent)),
		toBytes: () => Infinity,
		neg: a => new Scalar(-a.value),
		...Object.fromEntries(['add', 'sub', 'mul', 'div'].map(op => [op, (a, b) => {
			expect(a).toBeInstanceOf(Scalar);
			expect(b).toBeInstanceOf(Scalar);
			return new Scalar(numberAdapter[op](a.value, b.value));
		}])),
	};
	const Q = createQuantityClass({ numeric, parser: c => new NearleyParser(c) });
	expect(new Q('2 m').add('100 cm').scalar.value).toBe(3);
	expect(new Q('2 m').sub('100 cm').scalar.value).toBe(1);
	expect(new Q('2 m').mul('50 cm').scalar.value).toBe(1);
	expect(new Q('2 m').div('50 cm').scalar.value).toBe(4);
	const converted = new Q('2 m').to('cm');
	expect(converted.scalar).toBeInstanceOf(Scalar);
	expect(converted.scalar.value).toBe(200);
	expect(new Q('2 m').compareTo('200 cm')).toBe(0);
	expect(new Q('2 cm').toBase().scalar.value).toBe(0.02);
	expect(new Q('2 m').pow(new Scalar(-2)).scalar.value).toBe(0.25);
	expect(new Q('(2 m)^3').scalar.value).toBe(8);
	expect(new Q('20 tempC').to('tempK').scalar.value).toBe(293.15);
	expect(new Q('20 tempC').sub('32 tempF').scalar.value).toBeCloseTo(20);
	expect(new Q('20 tempC').add('18 degF').scalar.value).toBe(30);
	expect(new Q('20 tempC').mul(2).scalar.value).toBe(40);
	expect(new Q('20 tempC').div(2).scalar.value).toBe(10);
	expect(new Q('0 tempC').eq('273.15 degK')).toBe(true);
	expect(() => new Q('0 tempK').sub('1 degK')).toThrow('absolute zero');
	expect(() => new Q('1 m').add('1 s')).toThrow('Incompatible units');
	const Sized = createQuantityClass({ numeric: { ...numeric, toBytes: () => 24 }, parser: c => new NearleyParser(c) });
	const source = new Sized('2 m');
	expect(source.to('cm')).toBe(source.to('cm'));
	expect(source.to('cm').scalar.value).toBe(200);
});

it.each([
	['m', 'cm', 200, 300, 400],
	['mm400', 'm400', 0, 0, 0],
	['m400', 'mm400', Infinity, Infinity, Infinity],
])('caches native %s to %s factors without retaining scalar calculation results', (source, target, first, second, uncached) => {
	const pow = vi.fn(numberAdapter.powInteger);
	const numeric = overrideAdapter(numberAdapter, { powInteger: pow, toString: noFormatting });
	const Q = createQuantityClass({ numeric, parser: c => new RegexParser(c), config: { cache: { conversionResults: false } } });
	expect(new Q(2, source).to(target).scalar).toBe(first);
	pow.mockClear();
	expect(new Q(3, source).to(target).scalar).toBe(second);
	expect(pow).not.toHaveBeenCalled();
	const Uncached = Q.withConfig({ cache: false });
	expect(new Uncached(4, source).to(target).scalar).toBe(uncached);
	expect(pow).toHaveBeenCalled();
});

it('keeps large integer exponents exact for float quantities and parsed scalar powers', () => {
	const powInteger = vi.fn(floatAdapter.powInteger), pow = vi.fn(floatAdapter.pow);
	const numeric = overrideAdapter(floatAdapter, { powInteger, pow, toString: noFormatting });
	const Q = createQuantityClass({ numeric, parser: c => new NearleyParser(c) });
	for (const exponent of [16777217, -16777217])
	{
		expect(new Q('-1 m').pow(exponent).scalar).toBe(-1);
		expect(new Q(`(-1 m)^${exponent}`).scalar).toBe(-1);
		expect(powInteger).toHaveBeenCalledWith(-1, exponent);
	}
	expect(pow).not.toHaveBeenCalled();
	expect(new Q('(4)^0.5 m').scalar).toBe(2);
	expect(pow).toHaveBeenCalledWith(4, '0.5');
});

it('uses adapter size estimates and bypasses caching when an estimate is unavailable or fails', () => {
	for (const estimate of [undefined, -1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, '8', new Error('estimate failed')])
	{
		const toBytes = vi.fn(() => {
			if (estimate instanceof Error) throw estimate;
			return estimate;
		});
		const Q = createQuantityClass({ numeric: overrideAdapter(numberAdapter, { toBytes, toString: noFormatting }),
			parser: c => new RegexParser(c) });
		const source = new Q('2 m'), first = source.to('cm'), second = source.to('cm');
		expect(first.scalar).toBe(200);
		expect(second.scalar).toBe(200);
		expect(second).not.toBe(first);
		expect(toBytes).toHaveBeenCalledWith(200);
	}
	const toBytes = vi.fn(() => 8);
	const Q = createQuantityClass({ numeric: overrideAdapter(numberAdapter, { toBytes, toString: noFormatting }),
		parser: c => new RegexParser(c) });
	const source = new Q('2 m');
	expect(source.to('cm')).toBe(source.to('cm'));
	expect(toBytes).toHaveBeenCalledTimes(1);
});
