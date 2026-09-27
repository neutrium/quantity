import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '../dist/Quantity.js';
import { Quantity as RegexQuantity } from '../dist/regex.js';
import { QuantityCore } from '../dist/core.js';

for (const Constructor of [Quantity, RegexQuantity]) {
    describe(`temperature interval conversions with ${Constructor === Quantity ? 'Nearley' : 'Regex'}`, () => {
        it.each([
            ['20 tempC', 'mdegC', '20000'],
            ['20 tempC', 'mdegF', '36000'],
            ['20 tempC', 'kdegK', '0.02'],
            ['18 tempF', 'mdegC', '10000'],
            ['18 tempR', 'mdegK', '10000'],
            ['20 tempK', 'mdegR', '36000'],
            ['-20 tempC', 'mdegC', '-20000'],
            ['0 tempF', 'mdegC', '0'],
            ['20 tempC', 'degC*m/m', '20'],
            ['20 tempC', 'mdegF*m/m', '36000'],
            ['20 tempC', 'degC*m/cm', '0.2'],
        ])('converts %s to %s with scalar %s', (input, units, scalar) => {
            const result = new Constructor(input).to(units);
            expect(result).toBeInstanceOf(Constructor);
            expect(result.scalar.toString()).toBe(scalar);
        });

        it('agrees with conversion through unprefixed degrees for every temperature scale', () => {
            for (const input of ['20 tempC', '18 tempF', '18 tempR', '20 tempK', '-20 tempC', '0 tempF']) {
                const source = new Constructor(input);
                for (const degrees of ['degC', 'degF', 'degK', 'degR']) {
                    for (const prefix of ['m', 'k', 'u']) {
                        const target = prefix + degrees;
                        const direct = source.to(target);
                        const viaDegrees = source.to(degrees).to(target);
                        expect(direct.same(viaDegrees), `${input} -> ${target}`).toBe(true);
                        expect(direct.to(degrees).eq(source.to(degrees))).toBe(true);
                    }
                }
            }
        });

        it('ignores existing target scalars and creates only the result', () => {
            let constructions = 0;
            class Counted extends Constructor {
                constructor(...args) { super(...args); constructions++; }
            }
            const source = new Counted('20 tempC');
            for (const units of ['mdegC', 'degC*m/cm']) {
                const target = new Quantity('0 ' + units);
                constructions = 0;
                const result = source.to(target);
                expect(constructions).toBe(1);
                expect(result).toBeInstanceOf(Counted);
                expect(result.scalar.toString()).toBe(units === 'mdegC' ? '20000' : '0.2');
                expect(source.to(target)).toBe(result);
                expect(constructions).toBe(1);
            }
            expect(source.to('mdegC')).toBe(source.to('mdegC'));
            expect(source.scalar.toString()).toBe('20');
            expect(source.baseScalar.toString()).toBe('293.15');
        });

        it('preserves absolute offsets, interval arithmetic, and incompatible-unit errors', () => {
            const source = new Constructor('20 tempC');
            expect(source.to('tempK').scalar.toString()).toBe('293.15');
            expect(source.to('tempF').scalar.toString()).toBe('68');
            expect(source.add('1000 mdegC').scalar.toString()).toBe('21');
            expect(source.sub('1800 mdegF').scalar.toString()).toBe('19');
            expect(new Constructor('18000 mdegF').to('degC').scalar.toString()).toBe('10');
            expect(() => source.to('mdegC/m')).toThrow('Incompatible units');
            expect(() => source.to('1/mdegC')).toThrow('Cannot divide with temperatures');
            expect(() => new Constructor('-273.16 tempC')).toThrow('Temperatures must not be less than absolute zero');
        });
    });
}

it('uses resolved tokens for existing operands without parsing or formatting the source', () => {
    const parser = { parse() { throw new Error('Unexpected parsing'); } };
    class Custom extends QuantityCore {
        units() { throw new Error('Unexpected formatting'); }
    }
    const source = new Custom({ scalar: new Decimal(20), numerator: [{ unit: '<temp-C>', exponent: 1 }], denominator: [] }, undefined, parser);
    const target = new QuantityCore({ scalar: new Decimal(0), numerator: [{ unit: '<celsius>', prefix: '<milli>', exponent: 1 }], denominator: [] }, undefined, parser);
    expect(source.to(target).scalar.toString()).toBe('20000');
    expect(source.to(new Quantity('degC')).scalar.toString()).toBe('20');
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
