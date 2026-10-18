import assert from 'node:assert/strict';
import { test } from 'vitest';
import { NumberAdapter } from '@neutrium/utilities/number';
const numberAdapter = new NumberAdapter();
import { floatAdapter } from '../spec/helpers/numeric.js';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const decimalAdapter = new DecimalScientificAdapter();
import { createQuantityClass } from '../dist/factory.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';
import { compare } from './helpers.js';

for (const numeric of [numberAdapter, floatAdapter, decimalAdapter])
{
	test(`backend arithmetic: ${numeric.id}`, async ({ bench }) => {
		const Q = createQuantityClass({ numeric, parser: c => new RegexParser(c), config: { cache: { conversionResults: false } } });
		const length = new Q('2 m'), other = new Q('50 cm'), target = new Q('cm');
		const temperature = new Q('20 tempC'), kelvin = new Q('tempK'), interval = new Q('18 degF');
		const otherTemperature = new Q('10 tempC');
		const sameLength = new Q('3 m'), scalar = new Q(2), speed = new Q('2 m/s'), mass = new Q('3 kg');
		const check = expected => q => assert(Math.abs(numeric.toNumber(q.scalar) - expected) < 0.0001);
		await compare(bench, [
			{ name: 'convert with reused unit plan', run: () => length.to(target), validate: check(200) },
			{ name: 'cross-unit addition', run: () => length.add(other), validate: check(2.5) },
			{ name: 'same-unit addition', run: () => length.add(sameLength), validate: check(5) },
			{ name: 'unitless quantity multiplier', run: () => speed.mul(scalar), validate: check(4) },
			{ name: 'compound product without cancellation', run: () => speed.mul(mass), validate: result => {
				check(6)(result); assert.equal(result.units(), 'm*kg/s');
			} },
			{ name: 'division with partial unit cancellation', run: () => speed.div(length), validate: result => {
				check(1)(result); assert.equal(result.units(), '1/s');
			} },
			{ name: 'division with full unit cancellation', run: () => speed.div(speed), validate: result => {
				check(1)(result); assert(result.isUnitless());
			} },
			{ name: 'compound power one', run: () => speed.pow(1), validate: result => {
				check(2)(result); assert.equal(result.units(), 'm/s');
			} },
			{ name: 'compound positive power', run: () => speed.pow(2), validate: result => {
				check(4)(result); assert.equal(result.units(), 'm2/s2');
			} },
			{ name: 'compound negative power', run: () => speed.pow(-2), validate: result => {
				check(0.25)(result); assert.equal(result.units(), 's2/m2');
			} },
			{ name: 'cross-unit multiplication', run: () => length.mul(other), validate: check(1) },
			{ name: 'cross-unit division', run: () => length.div(other), validate: result => {
				check(4)(result); assert(result.isUnitless());
			} },
			{ name: 'temperature conversion', run: () => temperature.to(kelvin), validate: check(293.15) },
			{ name: 'temperature base conversion', run: () => temperature.toBase(), validate: result => {
				check(293.15)(result); assert.equal(result.units(), 'tempK');
			} },
			{ name: 'temperature subtraction', run: () => temperature.sub(otherTemperature), validate: result => {
				check(10)(result); assert.equal(result.units(), 'degC');
			} },
			{ name: 'temperature shift', run: () => temperature.add(interval), validate: check(30) },
		]);
	});
}
