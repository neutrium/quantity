import { Decimal } from '@neutrium/decimal'
import { Quantity } from './QuantityCore.js'
import type { QuantityDefinition } from './QuantityDefinition.js';
import { normalizePowers } from './operations/unit-powers.js';

/**
 * Input types shared by the constructor and arithmetic methods.
 *
 * A string may contain a scalar and units (`"2 m"`) or just a scalar (`"2"`).
 * Numbers, Decimal instances and objects with numeric toString() output become
 * dimensionless quantities when units are omitted. In addition and subtraction,
 * scalar inputs are dimensionless; they do not inherit the receiver's units.
 *
 * @remarks This union describes the shared input shape, not every valid combination
 * for every method. Consult the receiving method's parameters.
 */
export type QuantityInitParam = string | number | Decimal | NumericStringifiable | QuantityDefinition | Quantity;

/** An object whose toString() returns a numeric literal, validated at construction. */
export type NumericStringifiable = object & {
	/** Return a numeric literal without units; called once during construction. */
	toString(): string;
};

/**
 * Validate the scalar and counted unit records of a quantity definition.
 *
 * @param value - Any value, including null or undefined.
 * @returns Whether the value has a Decimal scalar and valid counted unit arrays.
 * Invalid or unreadable properties return false. Inputs are never normalized in place.
 * @remarks Checks registered unit/prefix tokens, positive safe-integer powers, and
 * duplicate-count overflow. NaN and Infinity are valid Decimal scalars. This does
 * not check physical temperature restrictions; construct a Quantity for those.
 * Decimal instances from the same installed package, including clones, are accepted;
 * serialized numeric or string scalars must first be converted to Decimal.
 * @example
 * ```ts
 * import { isQuantityDefinition } from '@neutrium/quantity/guards.js';
 *
 * isQuantityDefinition({ scalar: 1 }); // false
 * isQuantityDefinition(null); // false
 * ```
 */
export function isQuantityDefinition(value: unknown): value is QuantityDefinition
{
	try
	{
		if (value === null || typeof value !== 'object' || !('scalar' in value) ||
			!(value.scalar instanceof Decimal) || !('numerator' in value) || !('denominator' in value))
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
 * Test whether a value belongs to this package's shared Quantity core.
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
export const isQuantity = (x: unknown): x is Quantity => x instanceof Quantity
