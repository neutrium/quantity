import { describe, expect, it } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { Quantity as RegexQuantity } from '../dist/regex.js';
import { NearleyQtyParser } from '../dist/parsers/NearleyQtyParser.js';
import { RegexQtyParser } from '../dist/parsers/RegexQtyParser.js';
import { UnitTokenManager } from '../dist/UnitTokenManager.js';
import { stringifyUnits } from '../dist/operations/unit-strings.js';

describe('unit expression round trips', () => {
    for (const Constructor of [Quantity, RegexQuantity]) {
        it(`preserves compound denominators and reciprocals from ${Constructor === Quantity ? 'Nearley' : 'Regex'}`, () => {
            for (const [input, expected] of [
                ['kg/m/s', 'kg/m.s'], ['kg/cm/ms', 'kg/cm.ms'],
                ['m/s/kg', 'm/s.kg'], ['1/m', '1/m'], ['1/m/s', '1/m.s'],
                ['kg*m/s2/ampere3', 'kg*m/s2.A3'], ['m^-2*s^-3', '1/m2.s3'],
                ['m1000000/s1000000/kg2', 'm1000000/s1000000.kg2'],
                ['m/s/ton(l)', 'm/s.tnl'],
            ]) {
                const original = new Constructor(input);
                expect(original.units()).toBe(expected);
                for (const Target of [Quantity, RegexQuantity]) {
                    const copy = new Target(original.units());
                    expect(copy.numerator).toEqual(original.numerator);
                    expect(copy.denominator).toEqual(original.denominator);
                    expect(copy.same(original)).toBe(true);
                    expect(new Target(`2 ${original.units()}`).eq(original.mul(2))).toBe(true);
                }
            }
        });

        it('preserves electrical, radiation, temperature and prefixed aliases', () => {
            for (const [input, expected] of [
                ['farad', 'farad'], ['coulomb', 'coulomb'], ['roentgen', 'roentgen'],
                ['degF', 'degF'], ['degC', 'degC'], ['degR', 'degR'],
                ['min', 'min'], ['milliinch', 'm"'],
            ]) {
                const original = new Constructor(input);
                expect(original.units()).toBe(expected);
                for (const Target of [Quantity, RegexQuantity]) {
                    expect(new Target(original.units()).same(original)).toBe(true);
                }
            }
            // Existing temperature aliases still mean temperature intervals.
            expect(new Constructor('F').units()).toBe('degF');
            expect(new Constructor('C').units()).toBe('degC');
            expect(new Constructor('R').units()).toBe('degR');
        });
    }

    it('keeps denominator formatting separate from cached numerator products', () => {
        const product = new Quantity('s*kg');
        expect(product.units()).toBe('s*kg');
        expect(product.inverse().units()).toBe('1/s.kg');
        expect(product.clone().units()).toBe('s*kg');
        const reciprocal = new Quantity('cm^-1*hour^-1');
        expect(reciprocal.units()).toBe('1/cm.h');
        expect(reciprocal.inverse().units()).toBe('cm*h');
    });

    it('round trips every catalog unit with common prefixes through both parsers', () => {
        const manager = UnitTokenManager.instance;
        const parsers = [new NearleyQtyParser(), new RegexQtyParser()];
        for (const [unit, definition] of Object.entries(manager.values)) {
            if (definition.category === 'prefix' || unit === '<1>') continue;
            for (const prefix of [undefined, '<kilo>', '<milli>', '<micro>']) {
                const numerator = [{ unit, ...(prefix ? { prefix } : {}), exponent: 2 }];
                const expression = stringifyUnits(numerator);
                for (const parser of parsers) {
                    const parsed = parser.parse(expression);
                    expect(parsed.numerator, expression).toEqual(numerator);
                    expect(parsed.denominator, expression).toEqual([]);
                }
            }
        }
    });

    it('preserves grouping and rejects malformed division', () => {
        expect(new Quantity('m/(s*kg)^1').units()).toBe('m/s.kg');
        expect(new Quantity('m/s*kg').units()).toBe('m*kg/s');
        expect(new Quantity('1/m*s').units()).toBe('s/m');
        for (const Parser of [NearleyQtyParser, RegexQtyParser]) {
            const parser = new Parser();
            for (const input of ['m//s', '1//m', 'm/s/', 'm/ /s']) {
                expect(() => parser.parse(input), input).toThrow();
            }
        }
        expect(new Quantity('1^2').scalar.toString()).toBe('1');
        expect(new Quantity('2^3').scalar.toString()).toBe('8');
    });
});
