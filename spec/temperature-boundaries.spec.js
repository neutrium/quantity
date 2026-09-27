import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';

const modes = ['up', 'down', 'ceil', 'floor', 'half-up', 'half-down', 'half-even', 'half-ceil', 'half-floor'];
const boundaries = { tempK: '0', tempC: '-273.15', tempF: '-459.67', tempR: '0' };

for (const Entry of [Quantity, RegexQuantity]) {
    describe(`temperature boundaries: ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {
        it.each(modes)('preserves exact absolute zero with %s rounding at low precision', rounding => {
            for (const precision of [1, 3, 4, 5]) {
                const Q = Entry.withConfig({ precision, rounding });
                for (const [source, scalar] of Object.entries(boundaries)) {
                    const value = new Q(scalar, source);
                    expect(value.baseScalar.isZero()).toBe(true);
                    for (const [target, expected] of Object.entries(boundaries)) {
                        const result = value.to(target);
                        expect(result.scalar.toString(), `${source} -> ${target}`).toBe(expected);
                        expect(result.config).toBe(Q.config);
                        expect(result.to('tempK').scalar.isZero()).toBe(true);
                    }
                }
            }
        });

        it.each(modes)('keeps nearby valid temperatures above the boundary with %s rounding', rounding => {
            const Q = Entry.withConfig({ precision: 4, rounding });
            const Reference = Decimal.clone({ precision: 80, rounding });
            for (const input of ['0.000001', '0.001', '0.1', '1']) {
                for (const target of ['tempC', 'tempF']) {
                    const exact = target === 'tempC' ? new Reference(input).sub('273.15')
                        : new Reference(input).mul(9).div(5).sub('459.67');
                    const rounded = exact.toSD(4);
                    const expected = rounded.lt(boundaries[target]) ? boundaries[target] : rounded.toString();
                    const result = new Q(input, 'tempK').to(target);
                    expect(result.scalar.toString()).toBe(expected);
                    expect(result.gte(new Q('0 tempK'))).toBe(true);
                }
            }
        });

        it('validates unrounded interval and reciprocal sources before applying the boundary policy', () => {
            const Q = Entry.withConfig({ precision: 3, rounding: 'floor' });
            for (const target of ['tempC', 'tempF']) {
                expect(() => new Q('-1e-100 degK').to(target)).toThrow('absolute zero');
                expect(() => new Q('-1e100/degK').to(target)).toThrow('absolute zero');
                expect(new Q('1e-100 degK').to(target).scalar.toString()).toBe(boundaries[target]);
                expect(new Q('1e100/degK').to(target).scalar.toString()).toBe(boundaries[target]);
            }
            expect(() => new Q('-273.15000000000000000001 tempC')).toThrow('absolute zero');
            for (const input of ['-0.01 tempK', '-273.16 tempC', '-459.68 tempF', '-0.01 tempR'])
                expect(() => new Entry(input)).toThrow('absolute zero');
        });

        it('applies the same policy after shared settings change, including cached targets', () => {
            const value = new Entry('0 tempK');
            value.to('tempC');
            Decimal.config = { precision: 4, rounding: 'half-up' };
            expect(value.to('tempC').scalar.toString()).toBe('-273.15');
            expect(value.to(new Entry('0 tempF')).scalar.toString()).toBe('-459.67');
        });
    });
}
