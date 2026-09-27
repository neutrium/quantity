import { describe, expect, it } from 'vitest';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { getDegreeUnits } from '../dist/operations/temperature.js';

describe('shared temperature unit structures', () => {
    it.each([
        ['tempC', '<celsius>', 'degC'], ['tempF', '<fahrenheit>', 'degF'],
        ['tempK', '<kelvin>', 'degK'], ['tempR', '<rankine>', 'degR'],
    ])('shares frozen scalar-free metadata for %s across numerical contexts and parsers', (absolute, token, interval) => {
        const LowPrecision = RegexQuantity.withConfig({ precision: 3 });
        const a = new Quantity(`20 ${absolute}`), b = new LowPrecision(`10 ${absolute}`);
        const units = getDegreeUnits(a);
        expect(units).toEqual({ numerator: [{ unit: token, exponent: 1 }], denominator: [] });
        expect(units).not.toHaveProperty('scalar');
        expect(getDegreeUnits(b)).toBe(units);
        expect(getDegreeUnits(a.clone())).toBe(units);
        expect(Object.isFrozen(units)).toBe(true);
        expect(Object.isFrozen(units.numerator)).toBe(true);
        expect(Object.isFrozen(units.denominator)).toBe(true);
        expect(Object.isFrozen(units.numerator[0])).toBe(true);
        expect(() => { units.numerator = []; }).toThrow(TypeError);
        expect(() => { units.numerator[0].exponent = 2; }).toThrow(TypeError);
        const difference = a.sub(b);
        expect(difference.scalar.toString()).toBe('10');
        expect(difference.units()).toBe(interval);
        expect(difference.numerator).toBe(units.numerator);
        expect(difference.denominator).toBe(units.denominator);
        expect(a.add(`2 ${interval}`).scalar.toString()).toBe('22');
    });

    it('rejects quantities that are not standalone absolute temperatures', () => {
        for (const input of ['degC', 'm', 'degF/s', 'mdegK'])
            expect(() => getDegreeUnits(new Quantity(input))).toThrow('Expected an absolute temperature');
    });
});
