import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { createQuantityClass } from '@neutrium/quantity/core';

function check(quantity, operand, expected) {
    expect(quantity.compareTo(operand)).toBe(expected);
    expect(quantity.eq(operand)).toBe(expected === 0);
    expect(quantity.lt(operand)).toBe(expected === -1);
    expect(quantity.lte(operand)).toBe(expected !== undefined && expected <= 0);
    expect(quantity.gt(operand)).toBe(expected === 1);
    expect(quantity.gte(operand)).toBe(expected !== undefined && expected >= 0);
}

for (const Constructor of [Quantity, RegexQuantity]) {
    describe(`direct numeric comparisons with ${Constructor === Quantity ? 'Nearley' : 'Regex'}`, () => {
        it('interprets numbers and Decimals in the current units', () => {
            for (const input of ['10 m', '10 cm', '10 km/s', '10', '10 tempC', '10 degF', '10 m^-1']) {
                const quantity = new Constructor(input);
                for (const [value, expected] of [[5, 1], [10, 0], [15, -1]]) {
                    check(quantity, value, expected);
                    check(quantity, new Decimal(value), expected);
                }
            }
            const quantity = new Constructor('100 cm');
            expect(quantity.eq(1)).toBe(false);
            expect(quantity.eq('1 m')).toBe(true);
            expect(quantity.to('m').eq(1)).toBe(true);
            expect(() => quantity.eq('100')).toThrow('Incompatible units');
            expect(() => quantity.eq('1 s')).toThrow('Incompatible units');
        });

        it('preserves Decimal digits and accepts independently configured Decimal instances', () => {
            const quantity = new Constructor('1.000000000000000000000000000001 m');
            const Clone = Decimal.clone({ precision: 40 });
            check(quantity, new Decimal('1.000000000000000000000000000001'), 0);
            check(quantity, new Clone('1.000000000000000000000000000002'), -1);
            check(quantity, new Decimal('1.000000000000000000000000000000'), 1);
            check(quantity, 1, 1);
        });

        it('handles negative values, signed zero, infinities and NaN consistently', () => {
            const quantity = new Constructor('-2 m');
            check(quantity, -3, 1);
            check(quantity, -1, -1);
            check(new Constructor('0 m'), -0, 0);
            for (const operand of [NaN, new Decimal(NaN)]) check(quantity, operand, undefined);
            for (const operand of [Infinity, new Decimal(Infinity)]) check(quantity, operand, -1);
            for (const operand of [-Infinity, new Decimal(-Infinity)]) check(quantity, operand, 1);
            const make = scalar => new Constructor({ scalar: new Decimal(scalar), numerator: [], denominator: [] });
            check(make(NaN), 2, undefined);
            check(make(Infinity), Infinity, 0);
            check(make(-Infinity), -Infinity, 0);
            check(make(Infinity), 2, 1);
        });

        it('compares readings without base-scale overflow or temperature threshold construction', () => {
            check(new Constructor('2 km4000000000000000'), 1, 1);
            check(new Constructor('2 mm4000000000000000'), 1, 1);
            check(new Constructor('20 tempC'), -300, 1);
        });
    });
}

it('does not parse, allocate a Quantity, or resolve base values for numeric operands', () => {
    let constructions = 0;
    const Custom = createQuantityClass(() => ({ parse() { throw new Error('Unexpected parsing'); } }));
    class Counted extends Custom {
        constructor(...args) { super(...args); constructions++; }
    }
    const quantity = new Counted({
        scalar: new Decimal(10), numerator: [{ unit: '<meter>', exponent: 1 }], denominator: []
    });
    // Numeric comparisons should use only the original scalar, regardless of base values.
    Object.defineProperty(quantity, 'baseScalar', { get() { throw new Error('Unexpected base resolution'); } });
    constructions = 0;
    check(quantity, 5, 1);
    check(quantity, new Decimal(10), 0);
    check(quantity, NaN, undefined);
    expect(constructions).toBe(0);
});
