import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { Quantity as NumberQuantity } from '../dist/number.js';
import { compare } from './helpers.js';

const batchSize = 256;
for (const [backend, Base] of [['Decimal', Quantity], ['double', NumberQuantity]])
{
	for (const [mode, cache] of [['defaults', true], ['metadata off', { metadata: false }], ['all off', false]])
	{
		test(`metadata: ${backend}, ${mode}, ${batchSize} operations/batch`, async ({ bench }) => {
			const Q = Base.withConfig({ cache });
			const base = new Q('2 kg/m/s'), scaled = new Q('36 km/h'), unitless = new Q(2);
			const other = new Q('3 kg/m/s'), unitlessOther = new Q(3), length = new Q('2 m');
			const equal = expected => actual => assert.equal(actual, expected);
			const scalar = value => assert.equal(scaled.numeric.toNumber(value), 10);
			const cases = [
				{ name: 'shared units: addition', run: () => base.add(other), validate: result => {
					equal('kg/m.s')(result.units()); equal(5)(result.numeric.toNumber(result.scalar));
				} },
				{ name: 'shared units: scalar multiplication', run: () => base.mul(3), validate: result => {
					equal('kg/m.s')(result.units()); equal(6)(result.numeric.toNumber(result.scalar));
				} },
				{ name: 'shared units: clone', run: () => base.clone(), validate: result => {
					equal(base.signature)(result.signature); equal(2)(result.numeric.toNumber(result.scalar));
				} },
				{ name: 'fresh units: product', run: () => base.mul(length), validate: result => {
					equal('kg/s')(result.units()); equal(4)(result.numeric.toNumber(result.scalar));
				} },
				{ name: 'unitless addition', run: () => unitless.add(unitlessOther), validate: result => {
					assert(result.isUnitless()); equal(5)(result.numeric.toNumber(result.scalar));
				} },
				{ name: 'isBase, repeated pair', run: () => base.isBase() && !scaled.isBase(), validate: equal(true) },
				{ name: 'units, repeated compound', run: () => base.units(), validate: equal('kg/m.s') },
				{ name: 'units, repeated unitless', run: () => unitless.units(), validate: equal('') },
				{ name: 'construct and format numerator', run: () => new Q('2 kg*m').units(), validate: equal('kg*m') },
				{ name: 'construct and format fraction', run: () => new Q('36 km/h').units(), validate: equal('km/h') },
				{ name: 'baseScalar, repeated', run: () => scaled.baseScalar, validate: scalar },
				{ name: 'toBase, repeated', run: () => scaled.toBase(), validate: result => scalar(result.scalar) },
				{ name: 'construct scaled quantity', run: () => new Q('36 km/h'), validate: result => equal('km/h')(result.units()) },
			].map(entry => ({
				...entry,
				run: () => {
					let result;
					for (let i = 0; i < batchSize; i++) result = entry.run();
					return result;
				},
			}));
			if (process.env.BENCH_REVERSE === '1') cases.reverse();
			await compare(bench, cases);
		});
	}
}
