import { overrideAdapter } from './helpers/numeric.js';
import { add as addQuantity, sub as subtractQuantity } from '../dist/operations/arithmetic.js';
import { describe, it, expect, vi } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { NumberAdapter } from '@neutrium/utilities/number';
const numberAdapter = new NumberAdapter();
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const decimalAdapter = new DecimalScientificAdapter();
import { NearleyParser } from '../dist/parsers/NearleyParser.js';

for (const numeric of [numberAdapter, decimalAdapter])
{
	describe('shared addition/subtraction validation: ' + numeric.id, () => {
		const Q = createQuantityClass({ numeric, parser: c => new NearleyParser(c) });
		it('rejects incompatible, malformed and invalid temperature operands', () => {
			expect(() => new Q('1 m').add('1 s')).toThrow('Incompatible units');
			expect(() => new Q('1 m').sub('1 s')).toThrow('Incompatible units');
			expect(() => new Q('1 m').add(1)).toThrow('Incompatible units');
			expect(() => new Q('1 m').sub(null)).toThrow();
			expect(() => new Q('20 tempC').add('30 tempF')).toThrow('Cannot add two temperatures');
			expect(() => new Q('20 degC').sub('30 tempF')).toThrow('Cannot subtract a temperature');
			expect(() => new Q('0 tempK').add('-1 degK')).toThrow('absolute zero');
			expect(() => new Q('0 tempK').sub('1 degK')).toThrow('absolute zero');
		});
		it('validates before invoking numeric arithmetic', () => {
			const add = vi.fn((a, b) => numeric.add(a, b)), sub = vi.fn((a, b) => numeric.sub(a, b));
			const Specialized = createQuantityClass({
				numeric: overrideAdapter(numeric, { add, sub }),
				parser: c => new NearleyParser(c),
			});
			const length = new Specialized('1 m'), temperature = new Specialized('20 tempC');
			expect(() => addQuantity(length, '1 s')).toThrow('Incompatible units');
			expect(() => subtractQuantity(length, '1 s')).toThrow('Incompatible units');
			const Other = createQuantityClass({
				numeric: numeric === numberAdapter ? decimalAdapter : numberAdapter,
				parser: c => new NearleyParser(c),
			});
			expect(() => addQuantity(length, new Other('1 m'))).toThrow('Cannot mix numeric backends');
			expect(() => temperature.add('30 tempF')).toThrow('Cannot add two temperatures');
			expect(() => new Specialized('20 degC').sub(temperature)).toThrow('Cannot subtract a temperature');
			expect(() => length.add({ scalar: 'bad', numerator: [], denominator: [] })).toThrow();
			expect(add).not.toHaveBeenCalled();
			expect(sub).not.toHaveBeenCalled();
			expect(numeric.toNumber(addQuantity(length, '200 cm').scalar)).toBe(3);
			expect(numeric.toNumber(subtractQuantity(length, '200 cm').scalar)).toBe(-1);
			expect(add).toHaveBeenCalledTimes(numeric === numberAdapter ? 1 : 0);
			expect(sub).toHaveBeenCalledTimes(numeric === numberAdapter ? 1 : 0);
			add.mockClear();
			sub.mockClear();
			addQuantity(length, '2 m');
			expect(add).toHaveBeenCalledOnce();
			expect(add.mock.calls[0][1]).toEqual(numeric.from(2));
			subtractQuantity(length, '2 m');
			expect(sub).toHaveBeenCalledOnce();
			expect(sub.mock.calls[0][1]).toEqual(numeric.from(2));
		});
	});
}
