import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { createQuantityClass, QuantityCore } from '@neutrium/quantity/core';
import { isQuantityDefinition } from '@neutrium/quantity/guards.js';

for (const Entry of [Quantity, RegexQuantity]) {
    describe(`numeric construction: ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {
        it('constructs dimensionless quantities from all supported numeric forms', () => {
            for (const input of [2.5, '2.5', new Decimal('2.5'), new Number(2.5), new String('2.5'),
                { toString: () => '2.5' }, { toString: () => ' +2.5 ' }]) {
                for (const units of [undefined, '']) {
                    const q = new Entry(input, units);
                    expect(q.scalar.toString()).toBe('2.5');
                    expect(q.isUnitless()).toBe(true);
                    expect(q.numerator).toEqual([]);
                    expect(q.denominator).toEqual([]);
                    expect(q.units()).toBe('');
                    expect(q.eq(new Entry('2.5'))).toBe(true);
                    expect(q.clone().isUnitless()).toBe(true);
                }
            }
        });

        it('preserves exact text and snapshots numeric objects after one conversion', () => {
            const text = '12345678901234567890.1234567890123456789';
            let calls = 0;
            const input = { toString() { calls++; return text; }, valueOf() { throw new Error('Must not coerce to number'); } };
            const q = new Entry(input);
            expect(calls).toBe(1);
            expect(q.scalar.eq(new Decimal(text))).toBe(true);
            expect(q.initValue).toBe(q.scalar);
            input.toString = () => '99';
            expect(q.clone().scalar.eq(new Decimal(text))).toBe(true);
            expect(calls).toBe(1);
        });

        it('respects isolated Decimal settings and numeric special values', () => {
            const Q = Entry.withConfig({ precision: 3, minE: -5, maxE: 5 });
            expect(new Q({ toString: () => '1e6' }).scalar.toString()).toBe('Infinity');
            expect(new Q(new Decimal('1e-6')).scalar.isZero()).toBe(true);
            expect(new Q(1.2345).add(0).scalar.toString()).toBe('1.23');
            expect(new Q(-0).scalar.isNeg()).toBe(true);
            expect(new Q(new Decimal('-0')).scalar.isNeg()).toBe(true);
            expect(new Q({ toString: () => '-0' }).scalar.isNeg()).toBe(true);
            expect(new Q(NaN).scalar.isNaN()).toBe(true);
            expect(new Q(Infinity).scalar.toString()).toBe('Infinity');
            expect(new Q(-Infinity).scalar.toString()).toBe('-Infinity');
            expect(new Q(2).config).toBe(Q.config);
        });

        it('supports numeric arithmetic while retaining dimensional compatibility checks', () => {
            const q = new Entry(2);
            expect(q.add(3).scalar.toString()).toBe('5');
            expect(q.sub(new Decimal('0.5')).scalar.toString()).toBe('1.5');
            expect(q.add({ toString: () => '0.5' }).scalar.toString()).toBe('2.5');
            expect(q.mul(new Number(3)).scalar.toString()).toBe('6');
            expect(q.div({ toString: () => '4' }).scalar.toString()).toBe('0.5');
            for (const input of [1, new Decimal(1), { toString: () => '1' }]) {
                expect(() => new Entry('2 m').add(input)).toThrow(/compatible/);
                expect(() => new Entry('2 m').sub(input)).toThrow(/compatible/);
            }
            const metres = new Entry({ toString: () => '2.5' }, 'm');
            expect(metres.scalar.toString()).toBe('2.5');
            expect(metres.units()).toBe('m');
        });

        it('rejects objects that do not provide a numeric string', () => {
            for (const input of [null, undefined, true, false, {}, [], { toString: null },
                { toString: () => 2 }, { toString: () => '' }, { toString: () => '2 m' },
                { toString: () => '1 + 2' }, { toString: () => '+-2' }, { toString: () => 'abc' }]) {
                expect(() => new Entry(input)).toThrow();
                expect(() => new Entry(input, 'm')).toThrow();
            }
            expect(() => new Entry({ toString() { throw new Error('Unreadable scalar'); } })).toThrow('Unreadable scalar');
        });

        it('rejects inherited, unknown and non-string unit tokens at construction', () => {
            const valid = { unit: '<meter>', exponent: 1 };
            const bad = ['toString', 'constructor', '__proto__', 'hasOwnProperty', '<unknown>',
                1, null, undefined, Symbol('unit'), { toString: () => '<meter>' }];
            for (const token of bad) for (const term of [{ ...valid, unit: token }, { ...valid, prefix: token }]) {
                if (token === undefined && term.unit === '<meter>') continue; // An omitted prefix is valid.
                for (const side of ['numerator', 'denominator']) {
                    const definition = { scalar: new Decimal(1), numerator: [], denominator: [], [side]: [term] };
                    expect(isQuantityDefinition(definition)).toBe(false);
                    expect(() => new Entry(definition)).toThrow();
                    const Custom = createQuantityClass(() => ({ parse: () => definition }));
                    expect(() => new Custom('anything')).toThrow();
                }
            }
            for (const input of ['toString', 'constructor', '__proto__']) expect(() => new Entry(input)).toThrow();
            expect(new Entry({ scalar: new Decimal(1), numerator: [valid], denominator: [] }).units()).toBe('m');
        });
    });
}

it('constructs numeric inputs without parsing but retains the core parser requirement', () => {
    let calls = 0;
    const parser = { parse() { calls++; throw new Error('Parser called'); } };
    const Custom = createQuantityClass(() => parser);
    for (const input of [2, new Decimal(2), { toString: () => '2' }]) {
        expect(new Custom(input).add(1).scalar.toString()).toBe('3');
        expect(new QuantityCore(input, undefined, parser).isUnitless()).toBe(true);
    }
    expect(calls).toBe(0);
    expect(() => new Custom('2')).toThrow('Parser called');
    expect(() => new QuantityCore(2, undefined, undefined)).toThrow('A parser is required');
});
