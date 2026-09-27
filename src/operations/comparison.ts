import { typeguards } from '@neutrium/utilities';
import { Decimal } from '@neutrium/decimal';

import { Quantity } from '../QuantityCore.js'
import { throwIncompatibleUnits } from './errors.js';
import { sameUnits } from './unit-identity.js';
import { areInverseSignatures } from './unit-signatures.js';
import { compareTemperatures } from './temperature.js';
import { compareUnitValues } from './unit-scale.js';



export function eq(a: Quantity, b: string | number | Decimal | Quantity): boolean
{
	return compareTo(a, b) === 0;
}

export function lt(a: Quantity, b: string | number | Decimal | Quantity): boolean
{
	return compareTo(a, b) === -1;
}

export function lte(a: Quantity, b: string | number | Decimal | Quantity): boolean
{
	const comparison = compareTo(a, b);
	return comparison !== undefined && comparison <= 0;
}

export function gt(a: Quantity, b: string | number | Decimal | Quantity): boolean
{
	return compareTo(a, b) === 1;
}

export function gte(a: Quantity, b: string | number | Decimal | Quantity): boolean
{
	const comparison = compareTo(a, b);
	return comparison !== undefined && comparison >= 0;
}

// Return true if quantities and units match
// Quantity("100 cm").same(Quantity("100 cm"))  # => true
// Quantity("100 cm").same(Quantity("1 m"))     # => false
export function same(a: Quantity, b: Quantity): boolean
{
	return a.scalar.eq(b.scalar) && sameUnits(a, b);
}

export function isInverse(a: Quantity, b: string | Quantity) : boolean
{
	const other = typeguards.isString(b) ? a.createQuantity(b) : b;

	return other instanceof Quantity && areInverseSignatures(a.signature, other.signature);
}

// Compare two Qty objects. Throws an exception if they are not of compatible types.
// Comparisons are done based on the value of the quantity in base SI units.
//
// NOTE: We cannot compare inverses as that breaks the general compareTo contract:
//   if a.compareTo(b) < 0 then b.compareTo(a) > 0
//   if a.compareTo(b) == 0 then b.compareTo(a) == 0
//
//   Since "10S" == ".1ohm" (10 > .1) and "10ohm" == ".1S" (10 > .1)
//     Qty("10S").inverse().compareTo("10ohm") == -1
//     Qty("10ohm").inverse().compareTo("10S") == -1
//
//   If including inverses in the sort is needed, I suggest writing: Qty.sort(qtyArray,units)
function comparisonResult(comparison: number): -1 | 0 | 1 | undefined
{
	return Number.isNaN(comparison) ? undefined : comparison < 0 ? -1 : comparison > 0 ? 1 : 0;
}

export function compareTo(a: Quantity, b: string | number | Decimal | Quantity): -1 | 0 | 1 | undefined
{
	// A numeric threshold is expressed in the receiver's units, including
	// absolute-temperature readings. Do not parse or resolve a base quantity.
	if (typeof b === 'number' || b instanceof Decimal)
	{
		return comparisonResult(a.scalar.cmp(b));
	}

	if (typeguards.isString(b))
	{
		return compareTo(a, a.createQuantity(b));
	}
	if (!(b instanceof Quantity))
		throw new TypeError('Expected a number, Decimal, Quantity, or quantity expression');

	if (!isCompatible(a, b))
	{
		throwIncompatibleUnits();
	}

	let comparison: number;

	if (sameUnits(a, b))
	{
		comparison = a.scalar.cmp(b.scalar);
	}
	else
	{
		comparison = a.isTemperature() || b.isTemperature()
			? compareTemperatures(a, b) : compareUnitValues(a, b);
	}
	// Preserve the existing undefined result for unordered (NaN) comparisons.
	return comparisonResult(comparison);
}

//
// Check to see if units are compatible, but not the scalar part
// this check is done by comparing signatures for performance reasons
// if passed a string, it will create a unit object with the string and then do the comparison
// this permits a syntax like:
// unit =~ "mm"
// if you want to do a regexp on the unit string do this ...
// unit.units =~ /regexp/
//
export function isCompatible(a: Quantity, b: string | number | Quantity) : boolean
{
	if (typeguards.isString(b))
	{
		return isCompatible(a, a.createQuantity(b));
	}

	if (!(b instanceof Quantity))
	{
		return false;
	}

	if (b.signature !== undefined)
	{
		return a.signature === b.signature;
	}
	else
	{
		return false;
	}
}

// returns true if no associated units
// false, even if the units are "unitless" like 'radians, each, etc'
export function isUnitless(a: Quantity) : boolean
{
	return a.numerator.length === 0 && a.denominator.length === 0;
}
