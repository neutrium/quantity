import { Decimal } from '@neutrium/decimal'
import { Quantity } from './QuantityCore.js'
import type { QuantityDefinition } from './QuantityDefinition.js';

/**
 * Input types shared by the constructor and arithmetic methods.
 *
 * A string may contain a scalar and units (`"2 m"`) or just a scalar (`"2"`).
 * Numbers and Decimal instances need a nonempty units argument in the constructor;
 * they can be passed directly to {@link Quantity.mul} and {@link Quantity.div}.
 * {@link Quantity.add} and {@link Quantity.sub} require an expression or definition.
 *
 * @remarks This union describes the shared input shape, not every valid combination
 * for every method. Consult the receiving method's parameters.
 */
export type QuantityInitParam = string | number | Decimal | QuantityDefinition | Quantity;

/**
 * Test whether a value exposes a defined `scalar` property.
 *
 * @param value - Non-null value to inspect.
 * @returns Whether `value.scalar` is not `undefined`.
 * @throws TypeError for `null` or `undefined`.
 * @remarks This is a shallow discriminator, not a validator: it does not check
 * that the scalar is a Decimal or that numerator and denominator are valid arrays.
 * Do not use it alone to validate untrusted JSON.
 * @example
 * ```ts
 * import { isQuantityDefinition } from '@neutrium/quantity/guards.js';
 *
 * isQuantityDefinition({ scalar: 1 }); // true, but not a complete definition
 * isQuantityDefinition({}); // false
 * ```
 */
export function isQuantityDefinition(value: any): value is QuantityDefinition
{
	return (<QuantityDefinition>value).scalar !== undefined;
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
export const isQuantity = (x: any): x is Quantity => x instanceof Quantity
