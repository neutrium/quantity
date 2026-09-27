import type { UnitStructure } from '../QuantityDefinition.js';
import { UnitTokenManager } from '../UnitTokenManager.js';
import { checkedExponent } from './unit-powers.js';

// Derived units, including farads, use the base dimensions in the unit catalog.
const DIMENSIONS = ['length', 'time', 'temperature', 'mass', 'current', 'substance', 'luminosity', 'currency', 'data', 'angle'];
const INDEX = new Map(DIMENSIONS.map((dimension, index) => [dimension, index]));
export const TEMPERATURE_SIGNATURE = DIMENSIONS.map(dimension => dimension === 'temperature' ? 1 : 0).join(',');

/** Compare dimensional exponents without constructing or numerically inverting a quantity. */
export function areInverseSignatures(a: string, b: string): boolean
{
	const left = a.split(','), right = b.split(',');
	return left.length === right.length && left.every((exponent, index) => Number(exponent) === -Number(right[index]));
}

// Input must already use base units. Keep the full dimensional vector: radix-20 encoding collides for large powers.
export function unitSignature(a: UnitStructure): string
{
	const tm = UnitTokenManager.instance;
	const vector = new Array(DIMENSIONS.length).fill(0);

	for (const term of a.numerator)
	{
		const index = INDEX.get(tm.getUnit(term.unit)!.category);

		if (index !== undefined)
		{
			vector[index] = checkedExponent(vector[index] + term.exponent);
		}
	}

	for (const term of a.denominator)
	{
		const index = INDEX.get(tm.getUnit(term.unit)!.category);

		if (index !== undefined)
		{
			vector[index] = checkedExponent(vector[index] - term.exponent);
		}
	}

	return vector.join(',');
}
