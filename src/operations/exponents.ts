import type { RationalExponent, UnitExponent } from '../QuantityDefinition.js';
import { normalizeFraction, fractionFromTerm, parseFraction, addFractions, multiplyFractions, negateFraction } from '@neutrium/math/numeric/fractions';
import { RationalRangeError, type RationalTerm } from '@neutrium/math/numeric/rational';

const MAX = BigInt(Number.MAX_SAFE_INTEGER);
// Bound explicit decimal expansion, including scientific literals with tiny powers.
const MAX_DECIMAL_DIGITS = 4096n;

export function checkedExponent(value: number): number
{
	if (!Number.isSafeInteger(value))
	{
		throw new RangeError('Unit exponent must be a safe integer');
	}

	return value;
}

/** Apply Quantity's dimensional range and compact integer representation. */
function unitExponent(value: RationalExponent): UnitExponent
{
	const { numerator, denominator } = value;

	if (numerator > MAX * denominator || numerator < -MAX * denominator)
	{
		throw new RangeError('Unit exponent exceeds safe integer range');
	}

	return denominator === 1n ? Number(numerator) : value;
}

/** Validate definitions without accepting rounded floating-point unit counts. */
export function normalizeExponent(value: UnitExponent): UnitExponent
{
	if (typeof value === 'number')
	{
		return checkedExponent(value);
	}

	if (!value || typeof value !== 'object')
	{
		throw new TypeError('Invalid unit exponent');
	}

	return unitExponent(normalizeFraction(value));
}

export function exponentTerm(term: RationalTerm): UnitExponent
{
	if (!term.numerator)
	{
		return 0;
	}

	if (term.exponent > MAX_DECIMAL_DIGITS || term.exponent < -MAX_DECIMAL_DIGITS)
	{
		throw new RangeError('Unit exponent exceeds decimal expansion limit');
	}

	return unitExponent(fractionFromTerm(term, Number(MAX_DECIMAL_DIGITS)));
}

/** Decimal text is exact; a/b is reserved for explicit rational powers. */
export function parseExponent(text: string): UnitExponent
{
	if (/^[+-]?\d+$/.test(text))
	{
		return checkedExponent(Number(text));
	}

	try
	{
		return unitExponent(parseFraction(text, Number(MAX_DECIMAL_DIGITS)));
	}
	catch (error)
	{
		if (error instanceof TypeError)
		{
			throw new TypeError('Invalid exponent');
		}

		if (error instanceof RationalRangeError && error.code === 'EXPANSION_LIMIT')
		{
			throw new RangeError('Unit exponent exceeds decimal expansion limit');
		}

		throw error;
	}
}

function parts(value: UnitExponent): RationalExponent
{
	return typeof value === 'number' ? { numerator: BigInt(value), denominator: 1n } : value;
}

export function addExponents(a: UnitExponent, b: UnitExponent): UnitExponent
{
	if (typeof a === 'number' && typeof b === 'number')
	{
		return checkedExponent(a + b);
	}

	if (a === 0)
	{
		return b;
	}

	if (b === 0)
	{
		return a;
	}

	return unitExponent(addFractions(parts(a), parts(b)));
}

export function multiplyExponents(a: UnitExponent, b: UnitExponent): UnitExponent
{
	if (typeof a === 'number' && typeof b === 'number')
	{
		return checkedExponent(a * b);
	}

	if (a === 1)
	{
		return b;
	}

	if (b === 1)
	{
		return a;
	}

	return unitExponent(multiplyFractions(parts(a), parts(b)));
}

export function negateExponent(a: UnitExponent): UnitExponent
{
	return typeof a === 'number' ? -a : negateFraction(a);
}

export function exponentSign(a: UnitExponent): number
{
	return typeof a === 'number' ? Math.sign(a) : a.numerator > 0n ? 1 : a.numerator < 0n ? -1 : 0;
}

export function absExponent(a: UnitExponent): UnitExponent
{
	return exponentSign(a) < 0 ? negateExponent(a) : a;
}

export function exponentKey(a: UnitExponent): string
{
	return typeof a === 'number' ? String(a) : `${a.numerator}/${a.denominator}`;
}

export function equalExponents(a: UnitExponent, b: UnitExponent): boolean
{
	return a === b || typeof a !== 'number' && typeof b !== 'number' && a.numerator === b.numerator && a.denominator === b.denominator;
}
