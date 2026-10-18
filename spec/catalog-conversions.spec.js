import { expect, it } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
import { NumberAdapter } from '@neutrium/utilities/number';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';

function expectScalar(quantity, expected)
{
	if (typeof quantity.scalar === 'number')
	{
		// Relative tolerance also detects incorrect constants at very small magnitudes.
		expect(quantity.scalar / Number(expected)).toBeCloseTo(1, 14);
	}
	else
	{
		expect(quantity.scalar.eq(expected)).toBe(true);
	}
}

for (const Adapter of [DecimalScientificAdapter, NumberAdapter])
{
	for (const Parser of [NearleyParser, RegexParser]) for (const cache of [true, false])
	{
		const Q = createQuantityClass({ numeric: new Adapter(), parser: c => new Parser(c), config: { cache } });
		const context = `${Adapter.name}, ${Parser.name}, cache ${cache}`;

		it(`converts roentgens as exposure rather than absorbed dose: ${context}`, () => {
			const exposure = new Q('1 roentgen');
			expect(exposure.isCompatible('coulomb/kg')).toBe(true);
			expect(exposure.toBase().units()).toBe('A*s/kg');
			for (let repeat = 0; repeat < 2; repeat++) {
				expectScalar(exposure.to('coulomb/kg'), '0.000258');
				expectScalar(new Q('0.000258 coulomb/kg').to('roentgen'), '1');
				expectScalar(new Q('1 milliroentgen').to('coulomb/kg'), '0.000000258');
			}
			expectScalar(exposure.mul('1 kg').to('coulomb'), '0.000258');
			for (const unit of ['Gy', 'Sv', 'J/kg']) {
				expect(exposure.isCompatible(unit)).toBe(false);
				expect(() => exposure.to(unit)).toThrow('Incompatible units');
				expect(() => exposure.add(new Q(1, unit))).toThrow('Incompatible units');
				expect(() => exposure.compareTo(new Q(1, unit))).toThrow('Incompatible units');
			}
			expect(new Q('R').units()).toBe('degR'); // Preserve the existing temperature alias.
		});

		it(`uses the exact SI electronvolt definition: ${context}`, () => {
			const energy = new Q('1 eV');
			for (let repeat = 0; repeat < 2; repeat++) {
				expectScalar(energy.to('J'), '1.602176634e-19');
				expectScalar(new Q('1.602176634e-19 J').to('eV'), '1');
				expectScalar(new Q('1 keV').to('J'), '1.602176634e-16');
			}
			expectScalar(energy.add('1.602176634e-19 J'), '2');
		});
	}
}
