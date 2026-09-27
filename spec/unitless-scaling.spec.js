import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';

for (const Entry of [Quantity, RegexQuantity]) {
    const forms = value => [value, String(value), new Decimal(value), { toString: () => String(value) },
        new Entry(value), { scalar: new Decimal(value), numerator: [], denominator: [] }];
    describe(`unitless scaling: ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {
        it('preserves scaled dimensionless units for every scalar operand form', () => {
            const source = new Entry('50 cm/m');
            for (const input of forms(2)) {
                const product = source.mul(input), quotient = source.div(input);
                expect(product.scalar.toString()).toBe('100');
                expect(quotient.scalar.toString()).toBe('25');
                for (const result of [product, quotient]) {
                    expect(result.units()).toBe('cm/m');
                    expect(result.numerator).toBe(source.numerator);
                    expect(result.denominator).toBe(source.denominator);
                }
                expect(product.baseScalar.toString()).toBe('1');
                expect(quotient.baseScalar.toString()).toBe('0.25');
            }
            expect(source.scalar.toString()).toBe('50');
        });

        it('shares scalar behavior for dimensional quantities and large counted powers', () => {
            for (const text of ['50 km/h', '50 degF', '50 cm9007199254740991/m9007199254740991']) {
                const source = new Entry(text);
                for (const input of forms(2)) {
                    expect(source.mul(input).same(source.mul(2))).toBe(true);
                    expect(source.div(input).same(source.div(2))).toBe(true);
                }
            }
        });

        it('preserves the unit-bearing operand when the multiplier is on the left', () => {
            const source = new Entry('50 cm/m');
            const product = new Entry(2).mul(source);
            expect(product.same(source.mul(2))).toBe(true);
            expect(product.numerator).toBe(source.numerator);
            expect(product.denominator).toBe(source.denominator);
            const reciprocal = new Entry(2).div(source);
            expect(reciprocal.scalar.toString()).toBe('0.04');
            expect(reciprocal.units()).toBe('m/cm');
            expect(reciprocal.baseScalar.toString()).toBe('4');
        });

        it('retains receiver class, precision and rounding with foreign operands', () => {
            class Receiver extends Entry.withConfig({ precision: 3, rounding: 'down' }) {}
            const Foreign = Entry.withConfig({ precision: 40, rounding: 'up' });
            const scalar = new Receiver(2), source = new Foreign('1.2345 cm/m');
            const product = scalar.mul(source);
            expect(product).toBeInstanceOf(Receiver);
            expect(product.config).toBe(Receiver.config);
            expect(product.scalar.toString()).toBe('2.46');
            expect(product.units()).toBe('cm/m');
            const quotient = new Receiver('1.2345 cm/m').div(new Foreign(2));
            expect(quotient.scalar.toString()).toBe('0.617');
            expect(quotient.config).toBe(Receiver.config);
            expect(quotient.units()).toBe('cm/m');
            expect(source.scalar.toString()).toBe('1.2345');
        });

        it('retains absolute-temperature validation and numeric special-value behavior', () => {
            const temperature = new Entry('20 tempC'), boundary = new Entry('-273.15 tempC');
            for (const input of forms(2)) {
                expect(temperature.mul(input).scalar.toString()).toBe('40');
                expect(temperature.div(input).scalar.toString()).toBe('10');
                expect(() => boundary.mul(input)).toThrow('absolute zero');
            }
            expect(new Entry(2).mul(temperature).units()).toBe('tempC');
            expect(() => new Entry(2).div(temperature)).toThrow('Cannot divide with temperatures');
            const source = new Entry('50 cm/m');
            for (const value of [0, -0, Infinity, -Infinity, NaN]) {
                const operand = new Entry(value);
                for (const operation of ['mul', 'div']) {
                    const expected = source[operation](value), result = source[operation](operand);
                    expect(result.scalar.toString()).toBe(expected.scalar.toString());
                    expect(result.scalar.isNeg()).toBe(expected.scalar.isNeg());
                    expect(result.units()).toBe(source.units());
                }
            }
        });

        it('continues to combine explicit units on both operands', () => {
            const source = new Entry('50 cm/m');
            expect(source.mul('2 cm/m').units()).toBe('cm2/m2');
            expect(source.mul('2 cm/m').baseScalar.toString()).toBe('0.01');
            expect(source.div('2 cm/m').isUnitless()).toBe(true);
            expect(new Entry('3 m').mul('2 cm').units()).toBe('m2');
            expect(new Entry('3 m').div('2 cm').scalar.toString()).toBe('150');
        });
    });
}
