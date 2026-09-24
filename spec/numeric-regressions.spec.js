import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { createQuantityClass } from '@neutrium/quantity/core';
import { NearleyQtyParser, RegexQtyParser } from '@neutrium/quantity/parsers.js';

describe('zero powers', () => {
    for (const Constructor of [Quantity, RegexQuantity]) {
        it(`returns a dimensionless identity for ${Constructor === Quantity ? 'Nearley' : 'Regex'} quantities`, () => {
            for (const input of ['3 m', '0 m', '2 m/s', '20 tempC', '5']) {
                const q = new Constructor(input);
                for (const exponent of [0, '0', new Decimal(0), -0]) {
                    const result = q.pow(exponent);
                    expect(result.scalar.toString()).toBe('1');
                    expect(result.units()).toBe('');
                    expect(result.isUnitless()).toBe(true);
                    expect(result).toBeInstanceOf(Constructor);
                }
                expect(q.same(new Constructor(input))).toBe(true);
            }
        });
    }

    for (const Parser of [NearleyQtyParser, RegexQtyParser]) {
        it(`normalizes zero exponents in ${Parser.name} definitions`, () => {
            const parser = new Parser();
            for (const input of ['m0', 'm^0', '3 m^0', 'm^0/s^0']) {
                const definition = parser.parse(input);
                expect(definition.numerator).toEqual(['<1>']);
                expect(definition.denominator).toEqual(['<1>']);
                expect(new Quantity(definition).isUnitless()).toBe(true);
            }
            expect(new Quantity(parser.parse('m^0/s')).same(new Quantity('s^-1'))).toBe(true);
            expect(new Quantity(parser.parse('m/s^0')).same(new Quantity('m'))).toBe(true);
            expect(() => parser.parse('kk^0')).toThrow();
        });
    }

    it('normalizes zero powers of grouped expressions', () => {
        expect(new Quantity('(kg*m/s)^0').same(new Quantity('1'))).toBe(true);
        expect(new Quantity('3 (m/s)^0').same(new Quantity('3'))).toBe(true);
    });
});

describe('temperature factor precision', () => {
    it('compares and converts Fahrenheit and Rankine intervals exactly', () => {
        for (const source of ['degF', 'degR']) {
            const q = new Quantity(`18 ${source}`);
            expect(q.eq('10 degC')).toBe(true);
            expect(q.toBase().scalar.toString()).toBe('10');
            expect(q.to('degC').scalar.toString()).toBe('10');
            expect(new Quantity('10 degC').to(source).scalar.toString()).toBe('18');
            expect(new Quantity(`18 ${source}/m`).to('degK/m').scalar.toString()).toBe('10');
            expect(new Quantity(`10 m/${source}`).to('m/degK').scalar.toString()).toBe('18');
        }
    });

    it('uses consistent factors for absolute temperatures and interval arithmetic', () => {
        expect(new Quantity('32 tempF').eq('0 tempC')).toBe(true);
        expect(new Quantity('491.67 tempR').eq('0 tempC')).toBe(true);
        expect(new Quantity('20 tempC').add('18 degF').scalar.toString()).toBe('30');
        expect(new Quantity('20 tempC').sub('18 degR').scalar.toString()).toBe('10');
        expect(new Quantity('50 tempF').sub('32 tempF').to('degC').scalar.toString()).toBe('10');
        expect(new Quantity('0 tempC').to('tempF').to('tempC').scalar.toString()).toBe('0');
    });
});

describe('parser definition ownership', () => {
    it('does not overwrite a cached parser result when a separate scalar is supplied', () => {
        const definition = { scalar: new Decimal(1), numerator: ['<meter>'], denominator: ['<1>'] };
        const Custom = createQuantityClass(() => ({ parse: () => definition }));
        const q = new Custom('7', 'm');
        expect(q.scalar.toString()).toBe('7');
        expect(definition.scalar.toString()).toBe('1');
        expect(new Custom('m').scalar.toString()).toBe('1');
        expect(q.add('m').scalar.toString()).toBe('8');
        expect(definition.scalar.toString()).toBe('1');
    });

    it('accepts frozen parser-owned definitions and token arrays', () => {
        const definition = Object.freeze({
            scalar: new Decimal(1), numerator: Object.freeze(['<meter>']), denominator: Object.freeze(['<1>']),
        });
        const q = new Quantity('2.5', 'm', { parse: () => definition });
        expect(q.scalar.toString()).toBe('2.5');
        expect(q.mul(2).scalar.toString()).toBe('5');
        expect(definition.scalar.toString()).toBe('1');
    });
});
