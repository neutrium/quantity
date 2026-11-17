import type { NumericAdapter } from '@neutrium/math/numeric/core';
import type { ArithmeticAdapter } from '@neutrium/math/numeric/arithmetic';
import { hasRationalExtraction } from '@neutrium/math/numeric/rational';
import { powRational } from '@neutrium/math/numeric/powers';
import type { UnitExponent, RationalExponent } from '../QuantityDefinition.js';
import { parseExponent, normalizeExponent, exponentTerm, checkedExponent } from '../operations/exponents.js';

/** Check integrality before conversion so rounding to a native zero or one cannot give a false match. */
export function integerAsNumber<T>(numeric: NumericAdapter<T>, value: T): number | undefined
{
	return numeric.isInteger(value) ? numeric.toNumber(value) : undefined;
}

/** Signed zero survives native conversion. A noninteger that underflows still has a sign. */
export function scalarSign<T>(numeric: NumericAdapter<T>, value: T): number
{
	const number = numeric.toNumber(value);
	if (number !== 0 || numeric.isInteger(value)) return Math.sign(number);
	return Object.is(number, -0) ? -1 : 1;
}

/** Read dimensional powers before adapter rounding or display formatting can change them. */
export function quantityExponent<T>(numeric: ArithmeticAdapter<T>, value: string | number | T | RationalExponent): UnitExponent
{
	if (typeof value === 'number')
	{
		return Number.isInteger(value) ? checkedExponent(value) : parseExponent(String(value));
	}

	if (!numeric.isValue(value))
	{
		if (typeof value === 'string')
		{
			return parseExponent(value.trim());
		}

		if (value && typeof value === 'object' && 'numerator' in value && 'denominator' in value)
		{
			return normalizeExponent(value as RationalExponent);
		}
		throw new TypeError('Invalid exponent');
	}
	if (!numeric.isFinite(value))
	{
		throw new TypeError('Invalid exponent');
	}

	if (numeric.isInteger(value))
	{
		return checkedExponent(numeric.toNumber(value));
	}

	if (hasRationalExtraction(numeric))
	{
		return exponentTerm(numeric.toRationalTerm(value));
	}

	const text = numeric.toString(value);

	if (numeric.compare(numeric.from(text), value) !== 0)
	{
		throw new TypeError('The adapter rounded the exponent text. Supply an explicit exponent string or rational record.');
	}

	return parseExponent(text);
}

/** Scalar roots follow backend precision; dimensional powers remain exact. */
export function rationalPower<T>(numeric: ArithmeticAdapter<T>, value: T, exponent: UnitExponent): T
{
	return typeof exponent === 'number' ? numeric.powInteger(value, exponent) : powRational(numeric, value, exponent);
}

/** Quantity accepts numeric stringifiable objects in addition to adapter-native inputs. */
export function scalarFrom<T>(numeric: ArithmeticAdapter<T>, value: unknown): T
{
	if (value !== null && typeof value === 'object' && !numeric.isValue(value))
	{
		value = value.toString();

		if (typeof value !== 'string')
		{
			throw new TypeError('Expected a numeric string');
		}
	}

	return numeric.from(value);
}

/** Unknown/expensive scalar sizes disable caching of that result, never its calculation. */
export function scalarBytes<T>(numeric: NumericAdapter<T>, value: T): number
{
	try
	{
		const estimate = numeric.toBytes(value);
		if (Number.isSafeInteger(estimate) && estimate >= 0)
		{
			return estimate;
		}
	}
	catch
	{
		/* Size estimation must not prevent a calculation. */
	}

	return Number.MAX_SAFE_INTEGER;
}
