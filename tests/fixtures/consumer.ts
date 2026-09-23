import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { NearleyQtyParser, RegexQtyParser } from '@neutrium/quantity/parsers.js';
import { isQuantity, isQuantityDefinition, type QuantityInitParam } from '@neutrium/quantity/guards.js';

const scalar: Decimal = new Quantity('1 km').to('m').scalar;
const input: QuantityInitParam = new Decimal('0.1');
const quantity: Quantity = new Quantity(input, 'm').mul(3);

for (const parser of [new NearleyQtyParser(), new RegexQtyParser()])
{
	const parsed = parser.parse('2 m');
	const result: Quantity = new Quantity(parsed);
	const valid: boolean = isQuantity(result) && isQuantityDefinition(parsed);
}

const unknownValue: unknown = quantity;

if (isQuantity(unknownValue))
{
	const result: Decimal = unknownValue.scalar;
}

// @ts-expect-error Units must be supplied as a string.
new Quantity(1, 2);
// @ts-expect-error Powers require a decimal, number or string.
quantity.pow({});
