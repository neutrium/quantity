import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';

export class QuantizedDecimal extends DecimalScientificAdapter
{
	from(value)
	{
		return super.add(super.from(value), super.from(0));
	}
}

export class QuantizedArithmetic extends QuantizedDecimal
{
	toRationalTerm = undefined;
	fromRationalSum = undefined;
	compareRationalSum = undefined;
}
