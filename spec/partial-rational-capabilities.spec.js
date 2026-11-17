import { expect, it } from 'vitest';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
import { createQuantityClass } from '../dist/factory.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';
import { quantityExponent } from '../dist/numeric/support.js';
import { scalarTerm } from '../dist/operations/rational-terms.js';
import { CacheScope } from '../dist/utils/CacheScope.js';

const unused = () => { throw Error('Unneeded rational capability accessed'); };
const configure = (numeric, cache) => createQuantityClass({ numeric, parser: c => new RegexParser(c), config: { cache } });

it('requires a lossless exponent when a scientific adapter provides no rational extraction', () => {
    const numeric = new DecimalScientificAdapter();
    Object.defineProperty(numeric, 'toRationalTerm', { value: undefined });
    numeric.toString = value => value.toFixed(1);
    const Q = configure(numeric, true);
    const q = new Q('32 m');
    expect(() => q.pow(numeric.from('0.24'))).toThrow(/explicit.*exponent/i);
    expect(q.pow(numeric.from('0.2')).same(q.pow('1/5'))).toBe(true);
    expect(q.pow('0.24').units()).toBe('m^(6/25)');
    expect(q.pow({ numerator: 6n, denominator: 25n }).same(q.pow('0.24'))).toBe(true);
});

it('rounds the complete cross-unit sum or difference with extraction and construction alone', () => {
    const numeric = new DecimalArithmeticAdapter({ precision: 6 });
    Object.defineProperty(numeric, 'compareRationalSum', { get: unused });
    const Q = configure(numeric, true);
    const length = new Q('1 m');
    expect(length.sub('100.0001 cm').scalar.eq('-0.000001')).toBe(true);
    expect(length.add('-99.99999 cm').scalar.eq('0.0000001')).toBe(true);
    expect(new Q('31.6228 m^(1/2)').sub('1 km^(1/2)').scalar.eq('0.0000233983')).toBe(true);
    // One foot is exactly 3048e-4 metres. This power exceeds the exact expansion budget.
    const feetInMetres = new Q((3048n ** 1500n).toString() + 'e-6000', 'm1500');
    expect(feetInMetres.sub('1 ft1500').scalar.isZero()).toBe(true);
});

it('uses receiver rounding for whole-number sums without rational construction', () => {
    const numeric = new DecimalArithmeticAdapter({ precision: 2 });
    Object.defineProperty(numeric, 'fromRationalSum', { value: undefined });
    const Q = configure(numeric, true);
    const length = new Q('1 m');
    expect(length.add('123400 cm').scalar.toString()).toBe('1200');
    expect(length.add('1234 m').same(length.add('123400 cm'))).toBe(true);
});

it.each(['floor', 'half-even'])('preserves the sign of arithmetic cancellation without rational construction (%s)', rounding => {
	const n = new DecimalArithmeticAdapter({ rounding });
	Object.defineProperty(n, 'fromRationalSum', { value: undefined });
	const Q = configure(n, false);
	const length = new Q('1 m');
	const zero = n.toNumber(length.sub('1 m').scalar);
	expect(n.toNumber(length.sub('100 cm').scalar)).toBe(zero);
	expect(n.toNumber(length.add('-100 cm').scalar)).toBe(zero);

	expect(n.toNumber(new Q('-0 m').add('-0 cm').scalar)).toBe(-0);
});

it('exponent reading and cached extraction use extraction alone without formatting', () => {
    const numeric = new DecimalArithmeticAdapter();
    for (const method of ['fromRationalSum', 'compareRationalSum']) Object.defineProperty(numeric, method, { get: unused });
    numeric.toString = unused;
    let calls = 0;
    const extract = numeric.toRationalTerm;
    numeric.toRationalTerm = function(value) { calls++; return extract.call(this, value); };
    const value = numeric.from('0.5');
    expect(quantityExponent(numeric, value)).toEqual({ numerator: 1n, denominator: 2n });
    const scope = new CacheScope();
    const first = scalarTerm(value, numeric, scope);
    expect(scalarTerm(value, numeric, scope)).toBe(first);
    expect(calls).toBe(2);
});

for (const cache of [true, false]) {
    it(`conversion, products, temperature differences and roots need no comparison capability, cache=${cache}`, () => {
        const numeric = new DecimalArithmeticAdapter({ precision: 12 });
        Object.defineProperty(numeric, 'compareRationalSum', { get: unused });
        numeric.toString = unused;
        const Q = configure(numeric, cache);
        expect(new Q('1 ft').to('m').scalar.eq('0.3048')).toBe(true);
        expect(new Q('1 km^(1/2)').toBase().scalar.toString()).toBe('31.6227766017');
        expect(new Q('2 m').mul('3 cm').scalar.eq('.06')).toBe(true);
        expect(new Q('2 m').div('4 cm').scalar.eq(50)).toBe(true);
        expect(new Q('0 tempC').toBase().scalar.eq('273.15')).toBe(true);
        expect(new Q('20 tempC').sub('32 tempF').scalar.eq(20)).toBe(true);
        expect(new Q('4 m2').sqrt().scalar.eq(2)).toBe(true);
        expect(new Q('4 m2').pow(numeric.from('0.5')).units()).toBe('m');
    });

    it(`exact unit and temperature comparisons need no construction capability, cache=${cache}`, () => {
        const numeric = new DecimalArithmeticAdapter({ precision: 2, minE: -2, maxE: 2 });
        Object.defineProperty(numeric, 'fromRationalSum', { get: unused });
        numeric.toString = unused;
        const Q = configure(numeric, cache);
        for (const [a, b, expected] of [
            ['1 m', '100.000000000001 cm', -1], ['-1 m', '-100.000000000001 cm', 1],
            ['1 ft', '12 in', 0], ['1 km10000', '1 m10000', 1],
            ['0 tempC', '32 tempF', 0], ['0.01 tempC', '32 tempF', 1],
        ]) expect(new Q(a).compareTo(new Q(b))).toBe(expected);
        const narrow = new DecimalArithmeticAdapter({ maxE: 1 });
        Object.defineProperty(narrow, 'fromRationalSum', { get: unused });
        const N = configure(narrow, cache);
        expect(() => new N('-99 tempC')).not.toThrow();
    });
}

it('missing extraction retains arithmetic fallbacks and missing construction rejects roots', () => {
    const numeric = new DecimalArithmeticAdapter();
    Object.defineProperty(numeric, 'toRationalTerm', { value: undefined });
    const Q = configure(numeric, false);
    expect(new Q('1 ft').to('m').scalar.eq('0.3048')).toBe(true);
    expect(new Q('1 m').compareTo('99 cm')).toBe(1);
    expect(() => new Q('4 m2').sqrt()).toThrow('rational extraction and construction');
    const missingConstruction = new DecimalArithmeticAdapter();
    Object.defineProperty(missingConstruction, 'fromRationalSum', { value: undefined });
    const Partial = configure(missingConstruction, false);
    expect(() => new Partial('4 m2').sqrt()).toThrow('rational extraction and construction');
});

it('uses adapter arithmetic for scalars when extraction alone is available', () => {
	const numeric = new DecimalArithmeticAdapter({ precision: 3 });
	numeric.fromRationalSum = undefined;
	numeric.compareRationalSum = undefined;
	numeric.toRationalTerm = unused;
	const Q = configure(numeric, false);
	const length = new Q('1 m'), almost = new Q('99.999 cm');
	const right = numeric.mul(almost.scalar, numeric.from('0.01'));
	expect(length.sub(almost).scalar.eq(numeric.sub(length.scalar, right))).toBe(true);
	expect(length.compareTo(almost)).toBe(numeric.compare(length.scalar, right));
});
