import assert from 'node:assert/strict';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { Quantity as DoubleQuantity } from '@neutrium/quantity/number';
import { createQuantityClass, Quantity as SharedQuantity } from '@neutrium/quantity/factory';
import { NearleyParser, RegexParser, PrattParser } from '@neutrium/quantity/parsers.js';
import { isQuantity, isQuantityDefinition } from '@neutrium/quantity/guards.js';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
const decimalAdapter = new DecimalScientificAdapter();
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { NumberAdapter } from '@neutrium/math/adapters/number';
const numberAdapter = new NumberAdapter();

const Integers = createQuantityClass({ numeric: new BigIntAdapter(), parser: c => new RegexParser(c) });
assert.equal(new Integers('1 m').sub('50 cm').scalar, 0n);

assert.equal(new Quantity('1 km').to('m').scalar.toString(), '1000');
assert.equal(new Quantity('0.1').add('0.2').scalar.toString(), '0.3');
assert(new Quantity('32 tempF').eq(new RegexQuantity('0 tempC')));
assert.equal(new DoubleQuantity('1 km').to('m').scalar, 1000);
assert.equal(new Quantity(3n, 'm').mul(2n).scalar.toString(), '6');
assert.equal(new DoubleQuantity(3n).scalar, 3);

for (const numeric of [decimalAdapter, numberAdapter])
{
	for (const Parser of [NearleyParser, RegexParser, PrattParser])
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

const { PrattParser: DirectPratt, QuantityParseError } = await import('@neutrium/quantity/parsers/pratt');
assert.equal(DirectPratt, PrattParser);
assert(new DirectPratt().tryParse('m/', numberAdapter).error instanceof QuantityParseError);
console.log('Packed consumer runtime passed');

const { createQuantityEvaluator } = await import('@neutrium/quantity/expressions');

for (const Q of [Quantity, DoubleQuantity])
{
	const evaluator = createQuantityEvaluator({ Quantity: Q });
	assert(evaluator.evaluate('2 m/s * 1 kg + 4 kg.m/s').eq('6 kg*m/s'));
	assert(evaluator.evaluate('sqrt(4 m2)').eq('2 m'));
	assert.equal(evaluator.tryEvaluate('2 m + 3 s').error.code, 'DOMAIN_ERROR');
}
