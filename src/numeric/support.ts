import type { ScientificAdapter } from '@neutrium/utilities/numeric/scientific';
import type { ArithmeticAdapter } from '@neutrium/utilities/numeric/arithmetic';
import { toSafeInteger, IntegerConversionError } from '@neutrium/utilities/numeric/helpers';

/** Quantity accepts numeric stringifiable objects in addition to adapter-native inputs. */
export function scalarFrom<T>(numeric: ArithmeticAdapter<T>, value: unknown): T
{
	if (!numeric.isValue(value) && value !== null && typeof value === 'object')
	{
		value = value.toString();

		if (typeof value !== 'string')
		{
			throw new TypeError('Expected a numeric string');
		}
	}

	return numeric.from(value);
}

/** Validate dimensional exponents before backend precision or range can change them. */
export function integerExponent<T>(numeric: ArithmeticAdapter<T>, value: string | number | T): number
{
	try
	{
		return toSafeInteger(value, numeric);
	}
	catch (error)
	{
		if (!(error instanceof IntegerConversionError))
		{
			throw error;
		}

		if (error.reason === 'fractional')
		{
			throw new Error('Raising quantities to a fractional power not currently supported');
		}

		if (error.reason === 'invalid')
		{
			throw new TypeError('Invalid exponent');
		}

		throw new RangeError('Unit exponent must be a safe integer');
	}
}

/** Parser scalar powers also accept fractional literals when the backend supports them. */
export function power<T>(numeric: ArithmeticAdapter<T>, value: T, exponent: string): T
{
	if (numeric.tier === 'scientific')
	{
		let integer: number;
		try
		{
			integer = toSafeInteger(exponent);
		}
		catch (error)
		{
			if (!(error instanceof IntegerConversionError))
			{
				throw error;
			}

			// Preserve fractional and large literals for the scientific backend.
			return (numeric as ScientificAdapter<T>).pow(value, exponent);
		}

		return numeric.powInteger(value, integer);
	}

	return numeric.powInteger(value, integerExponent(numeric, exponent));
}

/** Unknown/expensive scalar sizes disable caching of that result, never its calculation. */
export function scalarBytes<T>(numeric: ArithmeticAdapter<T>, value: T): number
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
