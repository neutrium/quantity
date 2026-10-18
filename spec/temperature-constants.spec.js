import { overrideAdapter } from './helpers/numeric.js';
import { expect, it, vi } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const decimalAdapter = new DecimalScientificAdapter();
import { floatAdapter } from './helpers/numeric.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';

const configure = numeric => createQuantityClass({ numeric, parser: c => new RegexParser(c) });

it('reuses temperature constants across quantities without reconstructing the boundary', () => {
	const from = vi.fn(value => decimalAdapter.from(value));
	const numeric = Object.freeze(overrideAdapter(decimalAdapter, { from }));
	const Q = configure(numeric);

	for (let i = 0; i < 3; i++)
	{
		const value = new Q('20 tempC');
		expect(value.to('tempK').scalar.eq('293.15')).toBe(true);
		expect(value.add('1 degC').scalar.eq(21)).toBe(true);
		expect(value.mul(2).scalar.eq(40)).toBe(true);
	}

	expect(from.mock.calls.filter(([value]) => value === '-273.15')).toHaveLength(1);
});

it('isolates cached boundary scalars and rational offsets by adapter configuration', () => {
	const Wide = configure(decimalAdapter), Narrow = configure(decimalAdapter.withConfig({ maxE: 1 }));
	const Float = configure(floatAdapter);

	for (const Q of [Narrow, Wide, Float, Wide, Narrow])
	{
		const numeric = new Q(1).numeric;
		if (Q === Narrow)
		{
			expect(() => new Q('0 tempK').to('tempC')).toThrow(RangeError);
		}
		else
		{
			const zero = new Q('0 tempK').to('tempC');
			expect(numeric.compare(zero.scalar, numeric.from('-273.15'))).toBe(0);
		}

		const fahrenheit = new Q('1 tempC').to('tempF').scalar;

		if (Q === Float)
		{
			expect(numeric.toNumber(fahrenheit)).toBeCloseTo(33.8, 4);
		}
		else
		{
			expect(fahrenheit.eq('33.8')).toBe(true);
		}
	}
});
