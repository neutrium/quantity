import { describe, expect, it, vi } from 'vitest';

async function loadQuantities() {
    // Exercise both cache population orders against a fresh shared core.
    vi.resetModules();
    const { Quantity } = await import('../dist/Quantity.js');
    const { Quantity: RegexQuantity } = await import('../dist/regex.js');
    return [Quantity, RegexQuantity];
}

describe('structural unit identity', () => {
    for (const firstEntry of [0, 1]) {
        for (const firstUnit of ['min', 'milliinch']) {
            it(`isolates historically colliding aliases with entry ${firstEntry} and ${firstUnit} cached first`, async () => {
                const constructors = await loadQuantities();
                new constructors[firstEntry](firstUnit);
                for (const Constructor of constructors) {
                    const minute = new Constructor('min');
                    const length = new Constructor('milliinch');
                    expect(minute.units()).not.toBe(length.units());
                    expect(minute.toBase().units()).toBe('s');
                    expect(minute.baseScalar.toString()).toBe('60');
                    expect(length.toBase().units()).toBe('m');
                    expect(length.baseScalar.toString()).toBe('0.0000254');
                    expect(minute.isCompatible(length)).toBe(false);
                    expect(minute.same(length)).toBe(false);
                    expect(length.same(minute)).toBe(false);
                    for (const [source, target, expression] of [
                        [minute, length, 'milliinch'], [length, minute, 'min'],
                    ]) {
                        expect(() => source.to(target)).toThrow('Incompatible units');
                        expect(() => source.to(expression)).toThrow('Incompatible units');
                        expect(() => source.add(target)).toThrow('Incompatible units');
                    }
                }
            });
        }
    }

    it('distinguishes prefixes, powers and numerator/denominator placement', async () => {
        const [Quantity, RegexQuantity] = await loadQuantities();
        const cases = [
            ['cm', 'm', '0.01'], ['mm', 'm', '0.001'],
            ['cm2', 'm2', '0.0001'], ['cm^-1', 'm^-1', '100'],
            ['cm/s', 'm/s', '0.01'], ['s/cm', 's/m', '100'],
        ];
        for (const [source, target, expected] of cases) {
            const q = new Quantity(source);
            const other = new RegexQuantity(target);
            expect(q.to(other).scalar.toString()).toBe(expected);
            expect(q.same(other)).toBe(false);
        }
        const length = new Quantity('m');
        expect(length.same(new RegexQuantity('m2'))).toBe(false);
        expect(length.same(new RegexQuantity('m^-1'))).toBe(false);
    });

    it('preserves alias equality, unchanged-unit shortcuts and conversion caching across entries', async () => {
        const [Quantity, RegexQuantity] = await loadQuantities();
        const a = new Quantity('2 centimetres');
        const b = new RegexQuantity('2 cm');
        expect(a.same(b)).toBe(true);
        expect(a.same(new RegexQuantity('3 cm'))).toBe(false);
        expect(a.to(b)).toBe(a);
        expect(a.to('cm')).toBe(a);
        const target = new RegexQuantity('0 m');
        expect(a.to(target).scalar.toString()).toBe('0.02');
        expect(a.to(target)).toBe(a.to(target));
        expect(a.to('m')).toBe(a.to('m'));
    });

    it('does not consult display formatting for equality or ordinary conversion', async () => {
        const [Quantity, RegexQuantity] = await loadQuantities();
        const format = vi.spyOn(Quantity.prototype, 'units').mockImplementation(() => {
            throw new Error('Unexpected display formatting');
        });
        try {
            const a = new Quantity('2 cm');
            const b = new RegexQuantity('2 centimetres');
            expect(a.same(b)).toBe(true);
            expect(a.to(b)).toBe(a);
            expect(a.to('m').scalar.toString()).toBe('0.02');
            expect(a.toBase().scalar.toString()).toBe('0.02');
        } finally {
            format.mockRestore();
        }
    });
});
