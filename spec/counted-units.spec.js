import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { NearleyQtyParser, RegexQtyParser } from '@neutrium/quantity/parsers.js';

const term = (unit, exponent, prefix) => ({ unit, ...(prefix ? { prefix } : {}), exponent });

for (const [Constructor, Parser] of [[Quantity, NearleyQtyParser], [RegexQuantity, RegexQtyParser]]) {
	describe(`counted units with ${Parser.name}`, () => {
		it('stores million-sized positive, negative and zero powers without expansion', () => {
			const parser = new Parser();
			expect(parser.parse('m1000000').numerator).toEqual([term('<meter>', 1000000)]);
			expect(parser.parse('km^-1000000').denominator).toEqual([term('<meter>', 1000000, '<kilo>')]);
			const q = new Constructor('2 m/s').pow(1000000);
			expect(q.numerator).toEqual([term('<meter>', 1000000)]);
			expect(q.denominator).toEqual([term('<second>', 1000000)]);
			expect(q.scalar.eq(new Decimal(2).pow(1000000))).toBe(true);
			expect(q.units()).toBe('m1000000/s1000000');
			expect(q.inverse().units()).toBe('s1000000/m1000000');
			expect(q.pow(0).isUnitless()).toBe(true);
			expect(q).toBeInstanceOf(Constructor);
		});

		it('combines counts and cancels units during arithmetic', () => {
			const q = new Constructor('m1000000/s2');
			expect(q.mul('m1000000').units()).toBe('m2000000/s2');
			expect(q.div('m999999').units()).toBe('m/s2');
			expect(q.div(q).isUnitless()).toBe(true);
			expect(q.pow(-2).units()).toBe('s4/m2000000');
			// Prefixes are part of the identity of a counted unit.
			const ratio = new Constructor('km2/m2').pow(2);
			expect(ratio.units()).toBe('km4/m4');
			expect(ratio.toBase().isUnitless()).toBe(true);
			expect(ratio.baseScalar.toString()).toBe('1000000000000');
		});

		it('converts prefixed and derived large powers using weighted base dimensions', () => {
			const q = new Constructor('N1000000');
			const base = q.toBase();
			expect(base.numerator).toEqual([term('<kilogram>', 1000000), term('<meter>', 1000000)]);
			expect(base.denominator).toEqual([term('<second>', 2000000)]);
			expect(q.isCompatible(base)).toBe(true);
			expect(q.to(base).scalar.toString()).toBe('1');
			expect(new Constructor('km1000').to('m1000').scalar.eq(new Decimal(1000).pow(1000))).toBe(true);
			expect(new Constructor('m1000/km1000').toBase().scalar.eq(new Decimal(1000).pow(-1000))).toBe(true);
		});

		it('does not confuse high powers with a different physical dimension', () => {
			expect(new Constructor('m20').isCompatible('s')).toBe(false);
			expect(() => new Constructor('m20').add('s')).toThrow();
			expect(() => new Constructor('m20').to('s')).toThrow();
			expect(new Constructor('m1000000/s2').eq('1000000 mm1000000/s2')).toBe(false);
			expect(new Constructor('m20/s').isCompatible('1')).toBe(false);
			expect(new Constructor('m1000000').isCompatible('cm1000000')).toBe(true);
		});

		it('rejects unsafe exponents and intermediate count overflow', () => {
			for (const exponent of ['9007199254740992', '-9007199254740992', '999999999999999999999999']) {
				expect(() => new Parser().parse(`m^${exponent}`)).toThrow(/safe integer/);
				expect(() => new Constructor('1 m').pow(exponent)).toThrow(/safe integer/);
			}
			for (const exponent of [NaN, Infinity, -Infinity, 0.5]) {
				expect(() => new Constructor('1 m').pow(exponent)).toThrow();
			}
			const max = new Constructor('m9007199254740991');
			expect(max.numerator[0].exponent).toBe(Number.MAX_SAFE_INTEGER);
			expect(() => max.pow(2)).toThrow(/safe integer/);
			expect(() => max.mul('m')).toThrow(/safe integer/);
			expect(() => new Constructor('N9007199254740991')).toThrow(/safe integer/);
		});

		it('preserves absolute-temperature restrictions and interval powers', () => {
			for (const input of ['tempC2', 'tempK1000000', 'tempF^-2', 'm/tempR2', 'ktempC']) {
				expect(() => new Constructor(input)).toThrow();
			}
			expect(() => new Constructor('20 tempC').pow(2)).toThrow();
			expect(new Constructor('20 tempC').pow(0).units()).toBe('');
			expect(new Constructor('20 tempC').pow(1).same(new Constructor('20 tempC'))).toBe(true);
			expect(new Constructor('degC2').to('degK2').scalar.toString()).toBe('1');
		});

		it('returns immutable arrays without leaking mutable parser cache state', () => {
			const parser = new Parser();
			const parsed = parser.parse('m2');
			expect(Object.isFrozen(parsed.numerator)).toBe(true);
			expect(Object.isFrozen(parsed.numerator[0])).toBe(true);
			expect(() => { parsed.numerator[0].exponent = 3; }).toThrow(TypeError);
			parsed.numerator = [];
			expect(parser.parse('m2').numerator).toEqual([term('<meter>', 2)]);
		});
	});
}

it('scales and inverts nested groups using counts', () => {
	const q = new Quantity('((km/s)^1000)^1000');
	expect(q.numerator).toEqual([term('<meter>', 1000000, '<kilo>')]);
	expect(q.denominator).toEqual([term('<second>', 1000000)]);
	expect(new Quantity('(m2/s)^-3').units()).toBe('s3/m6');
	expect(() => new Quantity('(m9007199254740991)^2')).toThrow(/safe integer/);
	expect(new Quantity('((m/s)^1000000)^0').isUnitless()).toBe(true);
});

it('owns, validates and coalesces external counted definitions without mutating them', () => {
	const numerator = [term('<meter>', 2), term('<meter>', 3), term('<meter>', 2, '<kilo>')];
	const denominator = [term('<second>', 1)];
	const q = new Quantity({ scalar: new Decimal(2), numerator, denominator });
	expect(q.numerator).toEqual([term('<meter>', 5), term('<meter>', 2, '<kilo>')]);
	expect(q.numerator).not.toBe(numerator);
	expect(numerator).toHaveLength(3);
	numerator[0].exponent = 100;
	denominator.push(term('<meter>', 1));
	expect(q.units()).toBe('m5*km2/s');
	expect(q.clone().numerator).toBe(q.numerator);
	expect(q.mul(2).denominator).toBe(q.denominator);
	const definition = terms => ({ scalar: new Decimal(1), numerator: terms, denominator: [] });
	for (const terms of [
		['<meter>'], [term('<meter>', 0)], [term('<meter>', -1)], [term('<meter>', 1.5)],
		[term('<meter>', Infinity)], [term('<meter>', NaN)], [term('<unknown>', 1)],
		[term('<kilo>', 1)], [term('<meter>', 1, '<second>')],
		[term('<meter>', Number.MAX_SAFE_INTEGER), term('<meter>', 1)],
	]) expect(() => new Quantity(definition(terms))).toThrow();
});

it('rejects incomplete syntax and unknown units even when raised to zero', () => {
	for (const Parser of [NearleyQtyParser, RegexQtyParser]) {
		const parser = new Parser();
		for (const input of ['m/', 'm^', 'm**', 'kk^0', 'unknown0', 'm*']) {
			expect(() => parser.parse(input)).toThrow();
		}
	}
});

it('supports regex power syntax and signed denominator powers without expansion', () => {
	const q = new RegexQuantity('2 km**1000000/s^-1000000');
	expect(q.numerator).toEqual([term('<meter>', 1000000, '<kilo>'), term('<second>', 1000000)]);
	expect(q.denominator).toEqual([]);
});
