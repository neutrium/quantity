import { describe, expect, it } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const decimalAdapter = new DecimalScientificAdapter();
import { NumberAdapter } from '@neutrium/utilities/number';
const numberAdapter = new NumberAdapter();
import { floatAdapter } from './helpers/numeric.js';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';

for (const numeric of [decimalAdapter, numberAdapter, floatAdapter])
{
	for (const Parser of [NearleyParser, RegexParser])
	{
		describe(`${numeric.id} temperature boundaries with ${Parser.name}`, () => {
			const Q = createQuantityClass({ numeric, parser: c => new Parser(c) });
			it('accepts the represented boundary and rejects colder readings', () => {
				for (const [unit, boundary] of [['tempC', '-273.15'], ['tempF', '-459.67'], ['tempK', '0'], ['tempR', '0']]) {
					const value = new Q(numeric.from(boundary), unit);
					expect(numeric.toNumber(value.to('tempK').scalar)).toBeCloseTo(0, 4);
					expect(() => new Q(numeric.sub(numeric.from(boundary), numeric.from(1)), unit)).toThrow('absolute zero');
				}
			});
			it('checks arithmetic results and reciprocal absolute targets', () => {
				expect(() => new Q('0 tempK').sub('1 degK')).toThrow('absolute zero');
				expect(() => new Q('0 tempK').add('-1 degK')).toThrow('absolute zero');
				expect(() => new Q('-0.01/degK').to('tempK')).toThrow('absolute zero');
				expect(numeric.toNumber(new Q('0.01/degK').to('tempC').scalar)).toBeCloseTo(-173.15, 4);
			});
		});
	}
}

for (const Parser of [NearleyParser, RegexParser])
{
	for (const rounding of ['up', 'down', 'ceil', 'floor', 'half-up', 'half-down', 'half-even', 'half-ceil', 'half-floor'])
	{
		it(`preserves absolute zero and clamps rounded conversions: ${Parser.name}, ${rounding}`, () => {
			const numeric = decimalAdapter.withConfig({ precision: 2, rounding });
			const Q = createQuantityClass({ numeric, parser: c => new Parser(c) });
			const boundaries = [['tempK', '0'], ['tempR', '0'], ['tempC', '-273.15'], ['tempF', '-459.67']];

			for (const [source, minimum] of boundaries)
			{
				for (const [target, expected] of boundaries)
				{
					expect(new Q(minimum, source).to(target).scalar.toString()).toBe(expected);
				}
			}
			for (const [target, minimum] of boundaries)
			{
				const result = new Q('0.00001 tempK').to(target);
				expect(numeric.compare(result.scalar, numeric.from(minimum))).toBeGreaterThanOrEqual(0);
			}
			// Warming a valid reading must not fail because output rounding crosses the boundary.
			expect(new Q('-273.15 tempC').add('1 degC').scalar.gte('-273.15')).toBe(true);
			expect(() => new Q('-273.15 tempC').sub('0.000001 degC')).toThrow('absolute zero');
		});
	}
	for (const [numeric, input] of [
		[decimalAdapter.withConfig({ minE: -20 }), '1e-20'],
		[numberAdapter, '5e-324'],
		[floatAdapter, '1e-44'],
	]) {
		it(`converts physical underflow to absolute zero: ${Parser.name}, ${numeric.id}`, () => {
			const Q = createQuantityClass({ numeric, parser: c => new Parser(c) });
			for (const [target, minimum] of [['tempK', '0'], ['tempR', '0'], ['tempC', '-273.15'], ['tempF', '-459.67']])
			{
				const result = new Q(input, 'mdegK').to(target);
				expect(() => new Q(minimum, target).sub(new Q(input, 'mdegK'))).toThrow('absolute zero');
				expect(numeric.compare(result.scalar, numeric.from(minimum))).toBe(0);
				// Negative intervals must not become valid absolute readings through underflow.
				expect(() => new Q('-' + input, 'mdegK').to(target)).toThrow('absolute zero');
			}
		});
	}
}

it('keeps temperature-versus-interval comparison and conversion semantics', () => {
	for (const numeric of [decimalAdapter, numberAdapter, floatAdapter])
	{
		const Q = createQuantityClass({ numeric, parser: c => new NearleyParser(c) });
		expect(new Q('0 tempC').eq('273.15 degK')).toBe(true);
		expect(new Q('0 tempC').gt('0 degC')).toBe(true);
		expect(new Q('0 degC').lt('0 tempC')).toBe(true);
		// Conversion to an interval uses the reading, without an absolute offset.
		expect(numeric.toNumber(new Q('20 tempC').to('degC').scalar)).toBe(20);
		expect(new Q('20 tempC').sub('10 tempC').units()).toBe('degC');
	}
});
