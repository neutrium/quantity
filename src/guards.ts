import type { ArithmeticAdapter } from '@neutrium/utilities/numeric/arithmetic';
import { Quantity } from './QuantityCore.js'
import type { QuantityDefinition } from './QuantityDefinition.js';
import { normalizePowers } from './operations/unit-powers.js';

/**
 * Validate a definition using its intended numeric backend.
 * Checks scalar representation, registered tokens and safe unit counts without mutating input.
 * Physical temperature restrictions are checked by Quantity construction.
 * @param value - Candidate definition, including untrusted or unknown values.
 * @param numeric - Backend expected to recognize the definition's scalar.
 * @returns False for malformed definitions; does not throw or convert scalars.
 * @example
 * ```ts
 * import { Quantity } from '@neutrium/quantity/number';
 * import { isQuantityDefinition } from '@neutrium/quantity/guards.js';
 * const q = new Quantity('2 m');
 * const definition = { scalar: 2, numerator: q.numerator, denominator: [] };
 * isQuantityDefinition(definition, q.numeric); // true
 * isQuantityDefinition({ scalar: '2' }, q.numeric); // false
 * ```
 */
export function isQuantityDefinition<T>(value: unknown, numeric: ArithmeticAdapter<T>): value is QuantityDefinition<T>
{
	try
	{
		if (value === null || typeof value !== 'object' || !('scalar' in value) ||
			!numeric.isValue(value.scalar) || !('numerator' in value) || !('denominator' in value))
		{
			return false;
		}

		const validSide = (side: unknown): boolean => {
			if (!Array.isArray(side))
			{
				return false;
			}

			// The constructor and guard share token, category and count validation.
			normalizePowers(side);
			return true;
		};
		return validSide(value.numerator) && validSide(value.denominator);
	}
	catch
	{
		return false;
	}
}

/**
 * Test whether a value is a Quantity from any backend in this package.
 * @param x - Any value, including null or undefined.
 * @returns Whether the value is a Quantity from the default, regex, or custom entry point.
 * @remarks Plain definitions and instances from another copy of the package do
 * not pass this check.
 * @example
 * ```ts
 * import { Quantity } from '@neutrium/quantity';
 * import { isQuantity } from '@neutrium/quantity/guards.js';
 *
 * isQuantity(new Quantity('1 m')); // true
 * isQuantity(null); // false
 * isQuantity({ scalar: 1 }); // false
 * ```
 */
export const isQuantity = (x: unknown): x is Quantity<unknown> => x instanceof Quantity
