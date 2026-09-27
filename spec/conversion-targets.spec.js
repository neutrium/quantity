import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { createQuantityClass } from '@neutrium/quantity/core';

for (const Constructor of [Quantity, RegexQuantity]) {
    describe(`conversion targets with ${Constructor === Quantity ? 'Nearley' : 'Regex'}`, () => {
        it('ignores positive, zero and negative target scalars for equivalent sources', () => {
            for (const source of [new Constructor('10 m'), new Constructor('1000 cm')]) {
                for (const scalar of ['2', '0', '-2']) {
                    for (const [units, expected] of [['m', '10'], ['cm', '1000']]) {
                        const expression = `${scalar} ${units}`;
                        const target = new Constructor(expression);
                        const result = source.to(expression);
                        expect(result.scalar.toString()).toBe(expected);
                        expect(result.same(source.to(target))).toBe(true);
                        expect(result.eq(source)).toBe(true);
                        expect(source.to(expression)).toBe(result);
                        expect(source.to(target)).toBe(source.to(target));
                        expect(target.scalar.toString()).toBe(scalar);
                    }
                }
                expect(source.to(`0 ${source.units()}`)).toBe(source);
                expect(source.to('')).toBe(source);
            }
        });

        it('handles compound units, scientific scalars and dimensionless targets consistently', () => {
            const speed = new Constructor('10 m/s');
            for (const target of ['2 cm/s', '0 cm/s', '-2 cm/s', '2e3 cm/s']) {
                expect(speed.to(target).scalar.toString()).toBe('1000');
            }
            const ratio = new Constructor('10 m/m');
            for (const target of ['2', '0', '-2']) {
                const result = ratio.to(target);
                expect(result.scalar.toString()).toBe('10');
                expect(result.units()).toBe('');
            }
            expect(new Constructor('10 m').div('2 m').scalar.toString()).toBe('5');
        });

        it('ignores reciprocal target scalars while still rejecting inversion of zero', () => {
            const source = new Constructor('10 m');
            for (const target of ['2 cm^-1', '0 cm^-1', '-2 cm^-1']) {
                expect(source.to(target).scalar.toString()).toBe('0.001');
                expect(source.to(target).same(source.to(new Constructor(target)))).toBe(true);
                expect(() => new Constructor('0 m').to(target)).toThrow('Divide by zero');
            }
        });

        it('uses only temperature target units before applying value validation', () => {
            for (const [input, units, expected] of [
                ['20 tempC', 'tempF', '68'],
                ['20 tempC', 'tempK', '293.15'],
                ['20 tempC', 'degC', '20'],
                ['20 tempC', 'mdegC', '20000'],
                ['20 tempC', 'degC*m/m', '20'],
                ['18 degF', 'degC', '10'],
            ]) {
                const source = new Constructor(input);
                for (const scalar of ['2', '0', '-1000']) {
                    expect(source.to(`${scalar} ${units}`).scalar.toString()).toBe(expected);
                }
            }
            // Actual quantity values still enforce absolute zero.
            expect(() => new Constructor('-1000 tempK')).toThrow(/absolute zero/);
        });

        it('still validates target syntax, dimensions and absolute-temperature units', () => {
            const source = new Constructor('10 m');
            for (const target of ['0 unknown', '0 cm/', '-2 cm^', '0 s', '0 tempC*m']) {
                expect(() => source.to(target), target).toThrow();
            }
        });
    });
}

it('parses custom target strings once without mutating parser-owned results', () => {
    const parsed = {
        scalar: new Decimal(0),
        numerator: [{ unit: '<meter>', prefix: '<centi>', exponent: 1 }],
        denominator: []
    };
    const calls = [];
    const Custom = createQuantityClass(() => ({ parse(text) {
        calls.push(text);
        if (text !== 'custom centimetres') throw new Error('Unexpected input');
        return parsed;
    } }));
    const source = new Custom({
        scalar: new Decimal(2), numerator: [{ unit: '<meter>', exponent: 1 }], denominator: []
    });
    const result = source.to('custom centimetres');
    expect(result).toBeInstanceOf(Custom);
    expect(result.scalar.toString()).toBe('200');
    expect(source.to('custom centimetres')).toBe(result);
    expect(calls).toEqual(['custom centimetres']);
    expect(parsed.scalar.toString()).toBe('0');
    expect(Object.isFrozen(parsed.numerator)).toBe(false);
});

it('ignores powered scalar targets supported by Nearley', () => {
    expect(new Quantity('10 m/s').to('2^3 cm/s').scalar.toString()).toBe('1000');
});
