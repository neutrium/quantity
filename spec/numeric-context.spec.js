import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';


for (const Constructor of [Quantity, RegexQuantity]) {
    describe(`numeric configuration with ${Constructor === Quantity ? 'Nearley' : 'Regex'}`, () => {
        it('refreshes shared, instance and conversion caches when precision changes', () => {
            Decimal.config = { precision: 12 };
            const source = new Constructor('1 m/h');
            const target = new Constructor('0 ft/min');
            const oldBase = source.baseScalar;
            const oldString = source.to('ft/min');
            const oldQuantity = source.to(target);
            Decimal.config = { precision: 40 };
            const fresh = new Constructor('1 m*m/m/h');
            const expected = new Decimal(1).div(3600);
            expect(source.baseScalar.toString()).toBe(expected.toString());
            expect(new Constructor('1 m/h').baseScalar.toString()).toBe(expected.toString());
            expect(source.baseScalar.eq(fresh.baseScalar)).toBe(true);
            expect(source.baseScalar.eq(oldBase)).toBe(false);
            expect(source.to('ft/min')).not.toBe(oldString);
            expect(source.to(target)).not.toBe(oldQuantity);
            expect(source.to('ft/min').scalar.eq(fresh.to('ft/min').scalar)).toBe(true);
            expect(source.to(target).same(source.to('ft/min'))).toBe(true);
        });

        it('refreshes factors for rounding and exponent-range changes', () => {
            Decimal.config = { precision: 6, rounding: 'down' };
            const rate = new Constructor('1 m/h');
            expect(rate.baseScalar.toString()).toBe('0.000277777');
            Decimal.config = { rounding: 'up' };
            expect(rate.baseScalar.toString()).toBe('0.000277778');
            Decimal.config = { precision: 20, rounding: 'half-up', maxE: 20, minE: -20 };
            const distance = new Constructor('1 km10');
            expect(distance.baseScalar.toString()).toBe('Infinity');
            Decimal.config = { maxE: 40 };
            expect(distance.baseScalar.toString()).toBe('1e+30');
            expect(new Constructor('1 km10').baseScalar.toString()).toBe('1e+30');
        });

        it('uses current precision for temperature ratios without import-time rounding', () => {
            const fahrenheit = new Constructor('18 degF');
            for (const precision of [10, 40, 60]) {
                Decimal.config = { precision };
                expect(fahrenheit.to('degC').scalar.toString()).toBe('10');
                expect(new Constructor('18 degF/m').to('degK/m').scalar.toString()).toBe('10');
                expect(new Constructor('32 tempF').to('tempC').scalar.toString()).toBe('0');
                expect(new Constructor('0 tempC').to('tempF').scalar.toString()).toBe('32');
                expect(new Constructor('20 tempC').add('18 degF').scalar.toString()).toBe('30');
                expect(new Constructor('1 degF').to('degK').scalar.toString()).toBe(new Decimal(5).div(9).toString());
            }
            Decimal.config = { precision: 6, rounding: 'down' };
            expect(new Constructor('1 degF').to('degR').scalar.toString()).toBe('1');
            expect(new Constructor('1 tempF').to('degR').scalar.toString()).toBe('1');
        });

        it('preserves exact binary prefixes and named unit relationships', () => {
            Decimal.config = { precision: 60 };
            for (const [prefix, exponent] of [['Ki', 10], ['Mi', 20], ['Gi', 30], ['Ti', 40], ['Pi', 50],
                ['Ei', 60], ['Zi', 70], ['Yi', 80], ['Ri', 90], ['Qi', 100]]) {
                expect(new Constructor(`${prefix}B`).to('B').scalar.toString()).toBe(new Decimal(2n ** BigInt(exponent)).toString());
            }
            for (const [input, target, scalar] of [
                ['1 kph', 'km/h', '1'], ['1 knot', 'nmi/h', '1'], ['16 oz', 'lb', '1'],
                ['1 lb', 'oz', '16'], ['36 kph', 'm/s', '10'], ['1 kph2', 'km2/h2', '1'],
                ['1 kph^-2', 'h2/km2', '1']
            ]) expect(new Constructor(input).to(target).scalar.toString(), `${input} -> ${target}`).toBe(scalar);
        });

        it('does not apply public formatting limits to guarded intermediate coefficients', () => {
            Decimal.config = { maxOutputDigits: 20 };
            expect(new Constructor('18 degF').to('degC').scalar.toString()).toBe('10');
            expect(new Constructor('16 oz').to('lb').scalar.toString()).toBe('1');
        });
    });
}
