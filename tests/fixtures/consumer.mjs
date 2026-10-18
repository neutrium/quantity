import assert from 'node:assert/strict';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { Quantity as DoubleQuantity } from '@neutrium/quantity/number';
import { createQuantityClass, Quantity as SharedQuantity } from '@neutrium/quantity/factory';
import { NearleyParser, RegexParser } from '@neutrium/quantity/parsers.js';
import { isQuantity, isQuantityDefinition } from '@neutrium/quantity/guards.js';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const decimalAdapter = new DecimalScientificAdapter();
import { NumberAdapter } from '@neutrium/utilities/number';
const numberAdapter = new NumberAdapter();

assert.equal(new Quantity('1 km').to('m').scalar.toString(), '1000');
assert.equal(new Quantity('0.1').add('0.2').scalar.toString(), '0.3');
assert(new Quantity('32 tempF').eq(new RegexQuantity('0 tempC')));
assert.equal(new DoubleQuantity('1 km').to('m').scalar, 1000);

for (const numeric of [decimalAdapter, numberAdapter])
{
	for (const Parser of [NearleyParser, RegexParser])
	{
		const Q = createQuantityClass({ numeric, parser: c => new Parser(c) });
		const definition = new Parser().parse('2 kg.m/s^2', numeric);
		assert(isQuantityDefinition(definition, numeric));
		const q = new Q(definition);
		assert(isQuantity(q));
		assert(q instanceof SharedQuantity);
		assert(q.eq('2 N'));
		assert.equal(numeric.toNumber(q.add('1 N').scalar), 3);
		assert(q.clone() instanceof Q);
	}
}
for (const path of ['dist/Quantity.js', 'core', 'numeric/decimal', 'numeric/number', 'parsers/nearley-generic'])
{
	await assert.rejects(import('@neutrium/quantity/' + path), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
}
console.log('Packed consumer runtime passed');
