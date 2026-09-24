import assert from 'node:assert/strict';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { NearleyQtyParser, RegexQtyParser } from '@neutrium/quantity/parsers.js';
import { isQuantity, isQuantityDefinition } from '@neutrium/quantity/guards.js';

assert.equal(new Quantity('1 km').to('m').scalar.toString(), '1000');
assert.equal(new Quantity(new Decimal('0.1'), 'm').mul(3).scalar.toString(), '0.3');
assert(new Quantity('10 m').pow(-1).eq(new Quantity('0.1 m^-1')));
assert(new Quantity('32 tempF').eq(new Quantity('0 tempC')));

for (const Parser of [NearleyQtyParser, RegexQtyParser])
{
	const definition = new Parser().parse('2 kg.m/s^2');
	assert(isQuantityDefinition(definition));
	const quantity = new Quantity(definition);
	assert(isQuantity(quantity));
	assert(quantity.eq(new Quantity('2 N')));
}

await assert.rejects(import('@neutrium/quantity/dist/Quantity.js'), {
	code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
});

console.log('Packed consumer runtime passed');

// Configured entry points share the same core type and runtime guard.
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { createQuantityClass, QuantityCore } from '@neutrium/quantity/core';
import { RegexQtyParser as DirectRegexParser } from '@neutrium/quantity/parsers/regex';
import { NearleyQtyParser as DirectNearleyParser } from '@neutrium/quantity/parsers/nearley';
const CustomQuantity = createQuantityClass(() => new DirectRegexParser());
const customQuantity = new CustomQuantity('1e3 m').clone().add('1e3 m');
const regexQuantity = new RegexQuantity('1e3 m');
new DirectNearleyParser().parse('m');
assert(customQuantity instanceof CustomQuantity);
assert(customQuantity instanceof QuantityCore);
assert(isQuantity(regexQuantity));
assert.equal(customQuantity.scalar.toString(), '2000');
assert(regexQuantity.eq(new Quantity('1000 m')));
