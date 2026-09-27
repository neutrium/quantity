import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';

const modes = ['up', 'down', 'ceil', 'floor', 'half-up', 'half-down', 'half-even', 'half-ceil', 'half-floor'];

for (const Entry of [Quantity, RegexQuantity]) {
    describe(`exact temperature arithmetic: ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {
        it.each(modes)('validates before rounding and preserves the boundary with %s', rounding => {
            const Q = Entry.withConfig({ precision: 4, rounding });
            const zero = new Q('-273.15 tempC');
            for (const run of [() => zero.add('0 degC'), () => zero.sub('0 degC'),
                () => new Q('0 degF').add(zero),
                () => zero.mul(1), () => zero.mul('1'), () => new Q('1').mul(zero),
                () => zero.div(1), () => zero.div('1'), () => zero.pow(1)]) {
                const result = run();
                expect(result.scalar.toString()).toBe('-273.15');
                expect(result.config).toBe(Q.config);
            }
            expect(() => new Q('-273.14 tempC').sub('0.02 degC')).toThrow('absolute zero');
            expect(() => new Q('-273.14 tempC').add('-0.036 degF')).toThrow('absolute zero');
            expect(() => zero.sub('1e-100 degC')).toThrow('absolute zero');
            expect(() => zero.mul(new Decimal('1.' + '0'.repeat(99) + '1'))).toThrow('absolute zero');
            expect(() => zero.div(new Decimal('0.' + '9'.repeat(100)))).toThrow('absolute zero');
            expect(new Q('-273.14 tempC').sub('0.018 degF').scalar.toString()).toBe('-273.15');
            expect(new Q('-136.575 tempC').mul(2).scalar.toString()).toBe('-273.15');
            expect(new Q('-136.575 tempC').div('0.5').scalar.toString()).toBe('-273.15');
            expect(zero.add('0.00001 degC').gte(zero)).toBe(true);
        });

        it('retains tiny differences and transitive ordering without depending on input units', () => {
            for (const exponent of [100, 5000, 9000000000000000]) {
                const a = new Entry(`1e-${exponent} tempC`), b = new Entry('32 tempF'), c = new Entry('0 tempC');
                expect(a.compareTo(b)).toBe(1);
                expect(b.compareTo(a)).toBe(-1);
                expect(b.eq(c)).toBe(true);
                expect(a.gt(c)).toBe(true);
                expect(a.sub(b).scalar.toString()).toBe(`1e-${exponent}`);
                expect(b.sub(a).scalar.toString()).toBe(`-1.8e-${exponent}`);
                const negative = new Entry(`-1e-${exponent} tempC`);
                expect(negative.compareTo(b)).toBe(-1);
                expect(b.sub(negative).scalar.toString()).toBe(`1.8e-${exponent}`);
            }
            expect(new Entry('1e100 tempC').sub('1e100 tempK').scalar.toString()).toBe('273.15');
            expect(new Entry('1e100 tempK').sub('1e100 tempC').scalar.toString()).toBe('-273.15');
        });

        it.each(modes)('rounds the full difference once using %s', rounding => {
            const Q = Entry.withConfig({ precision: 3, rounding });
            const Reference = Decimal.clone({ precision: 3, rounding });
            // Fahrenheit result is exactly 1.805 minus/plus a tiny contribution.
            for (const sign of ['', '-']) {
                const input = sign + '1e-100';
                const result = new Q('33.805 tempF').sub(input + ' tempC');
                const expected = new Reference('1.805').sub(new (Decimal.clone({ precision: 150 }))(input).mul('1.8'));
                expect(result.scalar.toString()).toBe(expected.toString());
                expect(new Q(input + ' tempC').compareTo('32 tempF')).toBe(sign ? -1 : 1);
            }
        });

        it('handles compound intervals and external exponents without expanding powers', () => {
            const Q = Entry.withConfig({ precision: 4, rounding: 'floor' });
            const zero = new Q('-273.15 tempC');
            for (const units of ['ft10000/m10000*degK', 'm4000000000000000/km4000000000000000*degK']) {
                const interval = new Q('1 ' + units);
                expect(zero.compareTo(interval)).toBe(-1);
                expect(interval.compareTo(zero)).toBe(1);
                expect(zero.add(interval).scalar.toString()).toBe('-273.15');
                expect(() => zero.sub(interval)).toThrow('absolute zero');
            }
            expect(new Q('0 tempC').eq('273150 mdegK')).toBe(true);
            const factor = new (Decimal.clone({ precision: 80 }))('0.3048').pow(3000);
            const result = new Q('1e-1000 tempK').add('1 ft3000/m3000*degK');
            const expected = factor.add('1e-1000').toSD(4, 'floor');
            expect(result.scalar.toString()).toBe(expected.toString());
        });

        it('preserves receiver settings, input immutability, and nonfinite behavior', () => {
            const Low = Entry.withConfig({ precision: 4, rounding: 'down' });
            const High = Entry.withConfig({ precision: 50 });
            const zero = new High('-273.15 tempC');
            const result = new Low('0 degF').add(zero);
            expect(result.config).toBe(Low.config);
            expect(result.scalar.toString()).toBe('-273.15');
            expect(zero.config).toBe(High.config);
            const inf = new Low(new Decimal(Infinity), 'tempC');
            expect(inf.sub(inf).scalar.isNaN()).toBe(true);
            expect(inf.mul(0).scalar.isNaN()).toBe(true);
            expect(inf.add('1 degF').scalar.toString()).toBe('Infinity');
            Decimal.config = { precision: 1, minE: -1, maxE: 1 };
            expect(new High('1e-100 tempC').sub('32 tempF').scalar.toString()).toBe('1e-100');
        });
    });
}
