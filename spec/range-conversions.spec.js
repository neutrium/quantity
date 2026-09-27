import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';

const exponent = 4000000000000000;

for (const Constructor of [Quantity, RegexQuantity]) {
    describe(`range-safe values with ${Constructor === Quantity ? 'Nearley' : 'Regex'}`, () => {
        it('compares extreme magnitudes without conflating overflow or underflow', () => {
            for (const unit of ['km', 'mm']) {
                for (const [left, right, expected] of [[2, 1, 1], [1, 2, -1], [-2, -1, -1],
                    [-1, -2, 1], [0, 1, -1], [0, -1, 1], [2, 2, 0], [-2, -2, 0]]) {
                    const a = new Constructor(`${left} ${unit}${exponent}`);
                    for (const suffix of ['', '*s/s']) {
                        const b = new Constructor(`${right} ${unit}${exponent}${suffix}`);
                        expect(a.compareTo(b)).toBe(expected);
                        expect(b.compareTo(a)).toBe(expected === 0 ? 0 : -expected);
                        expect(a.eq(b)).toBe(expected === 0);
                        expect(a.lt(b)).toBe(expected < 0);
                        expect(a.gte(b)).toBe(expected >= 0);
                    }
                }
            }
        });

        it('converts relative factors before separately overflowing their base values', () => {
            for (const [unit, residual] of [['km', '2000'], ['mm', '0.002']]) {
                const source = new Constructor(`2 ${unit}${exponent}`);
                for (const scalar of ['2', '0', '-2']) {
                    const text = `${scalar} ${unit}${exponent}*s/s`;
                    expect(source.to(text).scalar.toString()).toBe('2');
                    expect(source.to(new Constructor(text)).scalar.toString()).toBe('2');
                }
                const target = `${unit}${exponent - 1}*m`;
                expect(source.to(target).scalar.toString()).toBe(residual);
                expect(source.to(target).to(source).scalar.toString()).toBe('2');
                expect(new Constructor(`0 ${unit}${exponent}`).to(target).scalar.toString()).toBe('0');
            }
        });

        it('includes the scalar before applying range limits to a base value', () => {
            Decimal.config = { maxE: 20, minE: -20 };
            expect(new Constructor('0 km10').baseScalar.toString()).toBe('0');
            expect(new Constructor('1e-20 km10').baseScalar.toString()).toBe('10000000000');
            expect(new Constructor('1e20 mm10').baseScalar.toString()).toBe('1e-10');
            expect(new Constructor('-1e-20 km10').to('m10').scalar.toString()).toBe('-10000000000');
            expect(new Constructor('1 km10').to('mm10').scalar.toString()).toBe('Infinity');
            expect(new Constructor('1 mm10').to('km10').scalar.toString()).toBe('0');
        });
    });
}
