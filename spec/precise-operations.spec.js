import { describe, expect, it } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';

for (const Entry of [Quantity, RegexQuantity]) {
    describe(`precise operations: ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {
        it('compares exact physical values independently of precision and rounding', () => {
            for (const rounding of ['up', 'down', 'half-up', 'floor', 'ceil']) {
                const Q = Entry.withConfig({ precision: 6, rounding });
                const a = new Q('100 cm'), b = new Q('1 m'), c = new Q('100.0001 cm');
                expect(a.eq(b)).toBe(true);
                expect(b.eq(c)).toBe(false);
                expect(a.eq(c)).toBe(false);
                expect(b.compareTo(c)).toBe(-1);
                expect(c.compareTo(b)).toBe(1);
                expect(new Q('18 degF').eq('10 degC')).toBe(true);
                expect(new Q('16 oz').eq('1 lb')).toBe(true);
            }
        });

        it('preserves significant input digits in comparisons and handles huge powers', () => {
            const Q = Entry.withConfig({ precision: 6 });
            const H = Entry.withConfig({ precision: 60 });
            const a = new Q('1 km4000000000000000');
            const b = new H('1.' + '0'.repeat(80) + '1 km4000000000000000*s/s');
            expect(a.compareTo(b)).toBe(-1);
            expect(b.compareTo(a)).toBe(1);
            expect(new Q('16 oz10000').compareTo('16 lb10000')).toBe(-1);
            expect(new Q('1 ft10000').compareTo('1 m10000')).toBe(-1);
            expect(new Q('-1 ft10000').compareTo('-1 m10000')).toBe(1);
            expect(new Q('1 ft10000').compareTo('1 ft10000*s/s')).toBe(0);
        });

        it('rounds a full temperature transform once and validates absolute zero before range loss', () => {
            const Q = Entry.withConfig({ precision: 6, rounding: 'down', minE: -20, maxE: 20 });
            expect(new Q('1 tempF').to('tempC').scalar.toString()).toBe('-17.2222');
            expect(new Q('1 tempC').to('tempF').scalar.toString()).toBe('33.8');
            expect(new Q('32 tempF').eq('0 tempC')).toBe(true);
            expect(new Q('32.000000000000000000001 tempF').gt('0 tempC')).toBe(true);
            expect(new Q('0 tempC').lt('32.000000000000000000001 tempF')).toBe(true);
            expect(() => new Q('-273.150000000000000000000001 tempC')).toThrow('absolute zero');
            expect(new Q('-273.15 tempC').to('tempK').scalar.isZero()).toBe(true);
            const Standard = Entry.withConfig({ precision: 20, rounding: 'half-up' });
            expect(new Standard('1 tempF').to('tempC').scalar.toString()).toBe('-17.222222222222222222');
        });

        it('combines arithmetic factors and reciprocal scale before enforcing range limits', () => {
            const Q = Entry.withConfig({ precision: 20, maxE: 20, minE: -20 });
            expect(new Q('1e20 m').div('1e20 km').scalar.toString()).toBe('0.001');
            expect(new Q('1e20 m').mul('1e-20 mm').scalar.toString()).toBe('0.001');
            expect(new Q('-9e20 m').add('1e18 km').scalar.toString()).toBe('100000000000000000000');
            expect(new Q('9e20 m').sub('1e18 km').scalar.toString()).toBe('-100000000000000000000');
            expect(new Q('9e20 mm2').to('1/m2').scalar.toString()).toBe('1.1111111111111111111e-15');
            const Wide = Q.withConfig({ minE: -40 });
            expect(new Wide('1e-30 km10').to('1/m10').scalar.toString()).toBe('1');
            expect(new Q('2e20 m').mul(10).scalar.toString()).toBe('Infinity');
            expect(() => new Q('0 m').to('1/m')).toThrow('Divide by zero');
        });

        it('handles reciprocal absolute-temperature targets with their offsets', () => {
            const Q = Entry.withConfig({ precision: 20 });
            expect(new Q('0.01/degK').to('tempC').scalar.toString()).toBe('-173.15');
        });
    });
}

it('uses consistent exact US liquid volume definitions at high precision', () => {
    const Q = Quantity.withConfig({ precision: 60 });
    for (const [input, target, expected] of [
        ['pint(us fl)', 'pint(usl)', '1'], ['quart', 'quart(usl)', '1'],
        ['gal(us)', 'pint', '8'], ['gal(us)', 'quart', '4'],
        ['gal(us)', 'floz(us)', '128'], ['gal(us)', 'in3', '231'],
    ]) expect(new Q(input).to(target).scalar.toString()).toBe(expected);
});
