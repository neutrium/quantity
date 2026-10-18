import { expect, it, vi } from 'vitest';
import { DecimalArithmeticAdapter } from '@neutrium/utilities/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
import { createQuantityClass } from '../dist/factory.js';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';

for (const Adapter of [DecimalArithmeticAdapter, DecimalScientificAdapter])
{
	it(`${Adapter.name} supplies exact operations without scalar serialization`, () => {

		class Unformatted extends Adapter
		{
			toString() { throw Error('Unexpected scalar formatting'); }
		}

		const numeric = new Unformatted({ precision: 20, maxOutputDigits: 2 });
		const extract = vi.spyOn(numeric, 'toRationalTerm');
		const sum = vi.spyOn(numeric, 'fromRationalSum');
		const compare = vi.spyOn(numeric, 'compareRationalSum');
		const power = vi.spyOn(numeric, 'powInteger');
		const Q = createQuantityClass({ numeric, parser: c => new NearleyParser(c), config: { cache: false } });
		expect(new Q('1 m').sub('99 cm').scalar.eq('0.01')).toBe(true);
		expect(new Q('20 tempC').eq('293.15 degK')).toBe(true);
		expect(new Q('32 tempF').to('tempC').scalar.isZero()).toBe(true);
		expect(new Q('2 m').pow(-3).scalar.eq('0.125')).toBe(true);
		// A Decimal-valued exponent must also bypass formatting.
		expect(new Q('2 m').pow(numeric.from(3)).scalar.eq(8)).toBe(true);
		expect(extract).toHaveBeenCalled();
		expect(sum).toHaveBeenCalled();
		expect(compare).toHaveBeenCalled();
		expect(power).toHaveBeenCalledWith(expect.anything(), -3);
		expect(Object.isFrozen(sum.mock.results[0].value)).toBe(true);
	});
}
