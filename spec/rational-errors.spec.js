import { expect, it, vi } from 'vitest';
import * as fractions from '@neutrium/math/numeric/fractions';
import { RationalRangeError } from '@neutrium/math/numeric/rational';
import { parseExponent } from '../dist/operations/exponents.js';

vi.mock('@neutrium/math/numeric/fractions', async original => {
    const module = await original();
    return { ...module, parseFraction: vi.fn(module.parseFraction) };
});

it('translates Math expansion limits by code independently of diagnostic wording', () => {
    vi.mocked(fractions.parseFraction).mockImplementation(() => {
        throw new RationalRangeError('EXPANSION_LIMIT', 'Different diagnostic wording');
    });
    expect(() => parseExponent('1e-5000')).toThrow('Unit exponent exceeds decimal expansion limit');
});

it('does not translate other failures merely because they have the old diagnostic message', () => {
    for (const error of [new RangeError('Fraction exceeds decimal expansion limit'),
        new RationalRangeError('PRECISION_LIMIT', 'Fraction exceeds decimal expansion limit')]) {
        vi.mocked(fractions.parseFraction).mockImplementation(() => { throw error; });
        let caught;
        try { parseExponent('1e-5000'); } catch (failure) { caught = failure; }
        expect(caught).toBe(error);
    }
});
