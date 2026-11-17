import type { UnitStructure } from '../QuantityDefinition.js';
import { UnitTokenManager } from '../UnitTokenManager.js';
import { addExponents, negateExponent, exponentKey } from './exponents.js';
import type { UnitExponent } from '../QuantityDefinition.js';

// Derived units, including farads, use the base dimensions in the unit catalog.
const DIMENSIONS = ['length', 'time', 'temperature', 'mass', 'current', 'substance', 'luminosity', 'currency', 'data', 'angle', 'sound'];
const INDEX = new Map(DIMENSIONS.map((dimension, index) => [dimension, index]));
const UNITLESS_SIGNATURE = DIMENSIONS.map(() => 0).join(',');
export const TEMPERATURE_SIGNATURE = DIMENSIONS.map(dimension => dimension === 'temperature' ? 1 : 0).join(',');

/** Compare dimensional exponents without constructing or numerically inverting a quantity. */
export function areInverseSignatures(a: string, b: string): boolean
{
	if (a === b)
	{
		return a === UNITLESS_SIGNATURE;
	}

	const left = a.split(','), right = b.split(',');
	// Signatures contain canonical integer/fraction strings, so inversion needs no parsing.
	return left.length === right.length && left.every((exponent, index) =>
		(exponent === '0' ? '0' : exponent.startsWith('-') ? exponent.slice(1) : '-' + exponent) === right[index]);
}

// Input must already use base units. Keep the full dimensional vector: radix-20 encoding collides for large powers.
export function unitSignature(a: UnitStructure): string
{
	if (!a.numerator.length && !a.denominator.length)
	{
		return UNITLESS_SIGNATURE;
	}

	const tm = UnitTokenManager.instance;
	const vector: UnitExponent[] = new Array(DIMENSIONS.length).fill(0);

	for (const term of a.numerator)
	{
		const index = INDEX.get(tm.getUnit(term.unit)!.category);

		if (index !== undefined)
		{
			vector[index] = addExponents(vector[index], term.exponent);
		}
	}

	for (const term of a.denominator)
	{
		const index = INDEX.get(tm.getUnit(term.unit)!.category);

		if (index !== undefined)
		{
			vector[index] = addExponents(vector[index], negateExponent(term.exponent));
		}
	}

	return vector.map(exponentKey).join(',');
}
