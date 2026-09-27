import { describe, expect, it, vi } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { createQuantityClass } from '@neutrium/quantity/core';
import { isQuantityDefinition } from '@neutrium/quantity/guards.js';
import { RegexQtyParser } from '@neutrium/quantity/parsers/regex';

const definition = (numerator = [], denominator = [], scalar = new Decimal(1)) => ({ scalar, numerator, denominator });
const metre = { unit: '<meter>', exponent: 1 };

describe('quantity definition validation', () => {
    it('safely rejects nullish values, incomplete shapes and non-Decimal scalars', () => {
        for (const value of [null, undefined, 1, '1', true, Symbol('quantity'), [], {}, new Decimal(1),
            { scalar: 1 }, { scalar: new Decimal(1) }, { scalar: new Decimal(1), numerator: [] },
            definition([], [], 1), definition([], [], '1'), definition([], [], null),
            definition(null), definition([], null), definition([], {}),
            { get scalar() { throw new Error('Unreadable scalar'); } }]) {
            expect(isQuantityDefinition(value)).toBe(false);
        }
    });

    it('checks unit records, registered tokens, prefix categories and count overflow', () => {
        for (const term of [null, undefined, '<meter>', {}, { unit: '<meter>' },
            { ...metre, unit: { toString: () => '<meter>' } },
            { ...metre, unit: '<unknown>' }, { ...metre, unit: 'toString' },
            { ...metre, unit: '<kilo>' }, { ...metre, prefix: '<second>' },
            { ...metre, prefix: null }, { ...metre, prefix: {} },
            ...[0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', 1n].map(exponent => ({ ...metre, exponent }))]) {
            expect(isQuantityDefinition(definition([term]))).toBe(false);
            expect(isQuantityDefinition(definition([], [term]))).toBe(false);
        }
        expect(isQuantityDefinition(definition(new Array(1)))).toBe(false);
        expect(isQuantityDefinition(definition([{ ...metre, exponent: Number.MAX_SAFE_INTEGER }, metre]))).toBe(false);
    });

    it('accepts valid mutable and frozen definitions without changing their ownership', () => {
        const input = definition([metre, { ...metre }]);
        const before = structuredClone(input.numerator);
        expect(isQuantityDefinition(input)).toBe(true);
        expect(input.numerator).toEqual(before);
        expect(Object.isFrozen(input.numerator)).toBe(false);
        expect(Object.isFrozen(metre)).toBe(false);
        for (const scalar of [new Decimal(1), new Decimal(NaN), new Decimal(Infinity), new (Decimal.clone({ precision: 40 }))(1)]) {
            expect(isQuantityDefinition(Object.freeze(definition(Object.freeze([Object.freeze({ ...metre })]), [], scalar)))).toBe(true);
        }
        expect(isQuantityDefinition(new Quantity('2 km/s'))).toBe(true);
        expect(isQuantityDefinition(new RegexQuantity('2 km/s'))).toBe(true);
    });

    it('leaves physical temperature validation to construction', () => {
        const belowZero = definition([{ unit: '<temp-K>', exponent: 1 }], [], new Decimal(-1));
        expect(isQuantityDefinition(belowZero)).toBe(true);
        expect(() => new Quantity(belowZero)).toThrow(/absolute zero/);
    });

    it('rejects invalid definition and parser scalars at construction', () => {
        for (const Constructor of [Quantity, RegexQuantity]) {
            expect(() => new Constructor(definition([metre], [], 1))).toThrow('Quantity scalar must be a Decimal');
            expect(() => new Constructor(null)).toThrow(TypeError);
        }
        const Custom = createQuantityClass(() => ({ parse: () => definition([metre], [], '1') }));
        expect(() => new Custom('m')).toThrow('Quantity scalar must be a Decimal');
    });
});

for (const Constructor of [Quantity, RegexQuantity]) {
    describe(`comparison contracts with ${Constructor === Quantity ? 'Nearley' : 'Regex'}`, () => {
        it('rejects unsupported operands with an explicit error', () => {
            const quantity = new Constructor('2');
            for (const method of ['eq', 'lt', 'lte', 'gt', 'gte', 'compareTo']) {
                for (const input of [true, null, undefined, definition()]) {
                    expect(() => quantity[method](input)).toThrow('Expected a number, Decimal, Quantity, or quantity expression');
                }
            }
            expect(quantity.eq('2')).toBe(true);
            expect(quantity.compareTo(new Constructor('3'))).toBe(-1);
            expect(quantity.isCompatible(2)).toBe(false);
        });

        it('handles unordered and infinite comparisons with same or different units', () => {
            const finite = new Constructor('1 m');
            for (const unit of [metre, { ...metre, prefix: '<centi>' }]) {
                const make = value => new Constructor(definition([unit], [], new Decimal(value)));
                const nan = make(NaN);
                for (const [left, right] of [[finite, nan], [nan, finite], [nan, nan]]) {
                    expect(left.compareTo(right)).toBeUndefined();
                    for (const method of ['eq', 'lt', 'lte', 'gt', 'gte']) expect(left[method](right)).toBe(false);
                }
                expect(make(Infinity).compareTo(finite)).toBe(1);
                expect(make(-Infinity).compareTo(finite)).toBe(-1);
                expect(make(Infinity).compareTo(make(Infinity))).toBe(0);
            }
        });
    });
}

it('parses each comparison string operand once', () => {
    const regex = new RegexQtyParser();
    const parse = vi.fn((text, Numeric) => regex.parse(text, Numeric));
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
