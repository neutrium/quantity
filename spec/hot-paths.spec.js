import { describe, expect, it, vi } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { createQuantityClass } from '@neutrium/quantity/core';
import { RegexQtyParser } from '@neutrium/quantity/parsers/regex';

describe('arithmetic hot paths', () => {
    it('constructs only the result for same-unit arithmetic', () => {
        let constructions = 0;
        class Counted extends Quantity {
            constructor(...args) { super(...args); constructions++; }
        }
        const a = new Counted('6 m');
        const b = new Counted('2 m');
        for (const [operation, expected] of [['add', '8'], ['sub', '4'], ['mul', '12'], ['div', '3']]) {
            constructions = 0;
            expect(a[operation](b).scalar.toString()).toBe(expected);
            expect(constructions).toBe(1);
        }
        expect(a.scalar.toString()).toBe('6');
        expect(b.scalar.toString()).toBe('2');
    });

    it('uses the original operand and its warm conversion cache', () => {
        const a = new Quantity('6 m');
        const b = new RegexQuantity('200 cm');
        const cached = b.to(a);
        const to = vi.spyOn(b, 'to');
        try {
            expect(a.add(b).scalar.toString()).toBe('8');
            expect(a.sub(b).scalar.toString()).toBe('4');
            expect(to).toHaveBeenCalledTimes(2);
            expect(to.mock.results.every(result => result.value === cached)).toBe(true);
        } finally { to.mockRestore(); }
    });

    it('keeps the receiving class when adding an absolute temperature on the right', () => {
        const degrees = new RegexQuantity('18 degF');
        const temperature = new Quantity('20 tempC');
        const result = degrees.add(temperature);
        expect(result).toBeInstanceOf(RegexQuantity);
        expect(result.scalar.toString()).toBe('30');
        expect(result.units()).toBe('tempC');
        expect(degrees.scalar.toString()).toBe('18');
        expect(temperature.scalar.toString()).toBe('20');
    });
});

describe('comparison hot paths', () => {
    it('parses each string operand once', () => {
        const regex = new RegexQtyParser();
        const parse = vi.fn(text => regex.parse(text));
        const Custom = createQuantityClass(() => ({ parse }));
        const q = new Custom('10 m');
        for (const [method, operand, expected] of [
            ['lte', '20 m', true], ['lte', '2 m', false], ['lte', '10 m', true],
            ['gte', '2 m', true], ['gte', '20 m', false], ['gte', '10 m', true],
        ]) {
            parse.mockClear();
            expect(q[method](operand)).toBe(expected);
            expect(parse).toHaveBeenCalledTimes(1);
        }
        expect(() => q.lte('1 s')).toThrow('Incompatible units');
    });

    it('preserves unordered and infinite comparison behaviour', () => {
        const make = value => new Quantity({ scalar: new Decimal(value), numerator: ['<meter>'], denominator: ['<1>'] });
        const finite = make(1);
        const nan = make(NaN);
        expect(nan.compareTo(finite)).toBeUndefined();
        for (const method of ['eq', 'lt', 'lte', 'gt', 'gte']) {
            expect(nan[method](finite)).toBe(false);
            expect(finite[method](nan)).toBe(false);
        }
        expect(make(Infinity).compareTo(finite)).toBe(1);
        expect(make(-Infinity).compareTo(finite)).toBe(-1);
        expect(make(Infinity).compareTo(make(Infinity))).toBe(0);
    });
});
