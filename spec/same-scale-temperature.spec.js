import { describe, expect, it, vi } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { DecimalArithmeticAdapter } from '@neutrium/utilities/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
import { RegexParser } from '../dist/parsers/RegexParser.js';

const configure = (numeric, cache) => createQuantityClass({ numeric, parser: c => new RegexParser(c), config: { cache } });
const scales = ['C', 'F', 'K', 'R'];

describe('same-scale rational temperature subtraction', () => {

	for (const Adapter of [DecimalArithmeticAdapter, DecimalScientificAdapter])
	{
		it.each([true, false])(`rounds only the final difference with ${Adapter.name}, cache=%s`, cache => {
			for (const rounding of ['up', 'down', 'ceil', 'floor', 'half-up', 'half-down', 'half-even', 'half-ceil', 'half-floor'])
			{
				const numeric = new Adapter({ precision: 2, rounding }), Q = configure(numeric, cache);

				for (const scale of scales)
				{
					for (const [a, b] of [['1001', '1000'], ['1.000001', '1'], ['1', '1.000001'], ['10.1234', '1']])
					{
						const left = new Q(a, `temp${scale}`), right = new Q(b, `temp${scale}`);
						const result = left.sub(right);
						expect(result.scalar.eq(numeric.sub(left.scalar, right.scalar))).toBe(true);
						expect(result.units()).toBe(`deg${scale}`);
						expect(result.numeric).toBe(numeric);
					}
				}
			}
		});
	}

	it('does not extract temperature offsets for matching contexts and scales', () => {
		const numeric = new DecimalScientificAdapter(), Q = configure(numeric, false);

		for (const scale of scales)
		{
			const a = new Q('20', `temp${scale}`), b = new Q('10', `temp${scale}`);
			const extract = vi.spyOn(numeric, 'toRationalTerm');
			const result = a.sub(b);
			expect(result.scalar.eq(10)).toBe(true);
			expect(extract.mock.calls.map(([scalar]) => scalar)).toEqual([a.scalar, b.scalar]);
			extract.mockRestore();
		}
	});

	it('retains final range handling and nonfinite subtraction', () => {
		const numeric = new DecimalScientificAdapter({ minE: -2, maxE: 1 }), Q = configure(numeric, true);

		for (const scale of scales)
		{
			expect(new Q('1.001', `temp${scale}`).sub(`1 temp${scale}`).scalar.isZero()).toBe(true);
			expect(new Q('1.01', `temp${scale}`).sub(`1 temp${scale}`).scalar.eq('0.01')).toBe(true);
			expect(new Q(Infinity, `temp${scale}`).sub(`1 temp${scale}`).scalar.toString()).toBe('Infinity');
			expect(new Q(Infinity, `temp${scale}`).sub(new Q(Infinity, `temp${scale}`)).scalar.isNaN()).toBe(true);
		}
		expect(new Q('99 tempC').sub('-99 tempC').scalar.toString()).toBe('Infinity');
	});

	it.each([true, false])('preserves zero signs from offset cancellation, cache=%s', cache => {
		const numeric = new DecimalScientificAdapter({ rounding: 'floor' }), Q = configure(numeric, cache);
		for (const scale of scales) for (const a of ['0', '-0']) for (const b of ['0', '-0'])
		{
			const result = new Q(a, `temp${scale}`).sub(new Q(b, `temp${scale}`));
			expect(result.scalar.isZero()).toBe(true);
			expect(result.scalar.isNeg()).toBe(scale === 'C' || scale === 'F');
		}
	});
});
