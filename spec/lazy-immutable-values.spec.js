import { describe, expect, it, vi } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import * as scales from '../dist/operations/unit-scale.js';
import * as temperatures from '../dist/operations/temperature.js';


for (const Entry of [Quantity, RegexQuantity]) {
    describe(`lazy immutable values: ${Entry === Quantity ? 'Nearley' : 'Regex'}`, () => {
        it('does not evaluate base factors during construction, copying, or same-unit arithmetic', () => {
            const resolve = vi.spyOn(scales, 'resolveUnitValue');
            const temperature = vi.spyOn(temperatures, 'temperatureBaseScalar');
            for (const input of ['1 m', '1 degF', '1 tempF', '1 ft12347']) {
                const q = new Entry(input);
                expect(q.signature).toBeTypeOf('string');
                expect(q.eq(q.clone())).toBe(true);
                expect(q.mul(2).scalar.toString()).toBe('2');
                if (!q.isTemperature()) expect(q.add(q).scalar.toString()).toBe('2');
            }
            expect(resolve).not.toHaveBeenCalled();
            expect(temperature).not.toHaveBeenCalled();
        });

        it('calculates base values on demand, caches them, and refreshes them with current settings', () => {
            const resolve = vi.spyOn(scales, 'resolveUnitValue');
            const q = new Entry('1 degF');
            Decimal.config = { precision: 6, rounding: 'down' };
            const first = q.baseScalar;
            expect(first.toString()).toBe('0.555555');
            expect(q.baseScalar).toBe(first);
            expect(q.toBase().scalar).toBe(first);
            expect(resolve).toHaveBeenCalledTimes(1);
            Decimal.config = { precision: 12 };
            expect(q.baseScalar.toString()).toBe('0.555555555555');
            expect(resolve).toHaveBeenCalledTimes(2);
        });

        it('keeps structural metadata across numeric configurations and validates immediately', () => {
            const Low = Entry.withConfig({ precision: 6 });
            const High = Entry.withConfig({ precision: 30 });
            const low = new Low('1 km/h'), high = new High('1 km/h');
            const lowBase = low.toBase(), highBase = high.toBase();
            expect(lowBase.numerator).toBe(highBase.numerator);
            expect(lowBase.denominator).toBe(highBase.denominator);
            expect(lowBase.scalar.toString()).toBe('0.277778');
            expect(highBase.scalar.toString()).toBe('0.277777777777777777777777777778');
            expect(() => new Low('-273.16 tempC')).toThrow('absolute zero');
            expect(() => new Low('tempC/m')).toThrow('Cannot divide with temperatures');
            expect(() => new Low('ft9007199254740991*ft')).toThrow();
        });

        it('blocks public value reassignment without corrupting cached conversions', () => {
            const q = new Entry('1 m');
            const cached = q.to('cm');
            for (const [field, value] of Object.entries({ scalar: new Decimal(2), signature: 'invalid',
                baseScalar: new Decimal(999), numerator: [], denominator: [], initValue: '2 m', decimal: Decimal })) {
                expect(() => { q[field] = value; }, field).toThrow(TypeError);
            }
            expect(q.to('cm')).toBe(cached);
            expect(q.to('cm').scalar.toString()).toBe('100');
            expect(q.to('mm').scalar.toString()).toBe('1000');
            expect(q.baseScalar.toString()).toBe('1');
            const copy = q.clone();
            expect(Object.isFrozen(copy.initValue)).toBe(true);
            expect(() => { copy.initValue.scalar = new Decimal(2); }).toThrow(TypeError);
            expect(copy.same(q)).toBe(true);
        });

        it('retains subclass behavior and immutable values in configured results', () => {
            class Custom extends Entry { label = 'custom'; }
            const Configured = Custom.withConfig({ precision: 6 });
            const q = new Configured('1 degF');
            for (const result of [q.clone(), q.add(q), q.mul(2), q.to('degC')]) {
                expect(result).toBeInstanceOf(Custom);
                expect(result.config).toBe(Configured.config);
                expect(result.label).toBe('custom');
                expect(() => { result.scalar = new Decimal(2); }).toThrow(TypeError);
            }
        });
    });
}
