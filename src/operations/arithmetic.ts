import { validateTemperatureSum, subtractTemperatures, changeTemperature, scaleTemperature } from './temperature.js';
import { acceptsNumericOperand } from '../numeric/backend.js';
import { Quantity, type QuantityInput } from '../QuantityCore.js';
import { throwIncompatibleUnits } from './errors.js';
import { scaledSum, scaledProduct } from './unit-scale.js';
import { sameUnits } from './unit-identity.js';
import { integerExponent } from '../numeric/support.js';
import { cancelPowers, combinePowers, scalePowers, UNITY } from './unit-powers.js';
import { TEMPERATURE_SIGNATURE } from './unit-signatures.js';

/** Validate backend, dimensions and temperature rules before converting or adding scalars. */
function sum<T, C extends object>(a: Quantity<T, C>, input: QuantityInput<T>, subtract: boolean): Quantity<T, C>
{
	const b = operand(a, input);

	if (!a.isCompatible(b))
	{
		throwIncompatibleUnits();
	}

	const aTemperature = a.isTemperature(), bTemperature = b.isTemperature();
	validateTemperatureSum(aTemperature, bTemperature, subtract);
	const n = a.numeric;

	if (aTemperature && bTemperature)
	{
		return subtractTemperatures(a, b);
	}

	if (aTemperature || bTemperature)
	{
		const temp = aTemperature ? a : b, interval = aTemperature ? b : a;
		return changeTemperature(temp, interval, subtract, a);
	}
	const scalar = sameUnits(a, b, a.cacheScope)
		? subtract ? n.sub(a.scalar, b.scalar) : n.add(a.scalar, b.scalar)
		: scaledSum(a, b, subtract, n, a.cacheScope);

	return a.createResult(scalar, a);
}

/** Add a compatible operand after validation and conversion to the receiver’s units. */
export function add<T, C extends object>(a: Quantity<T, C>, input: QuantityInput<T>): Quantity<T, C>
{
	return sum(a, input, false);
}

/** Subtract a compatible operand after validation and conversion to the receiver’s units. */
export function sub<T, C extends object>(a: Quantity<T, C>, input: QuantityInput<T>): Quantity<T, C>
{
	return sum(a, input, true);
}

export function operand<T>(a: Quantity<T>, b: QuantityInput<T>): Quantity<T>
{
	if (b instanceof Quantity)
	{
		if (!acceptsNumericOperand(a.numeric, b.numeric, b.scalar))
		{
			throw new TypeError('Cannot mix numeric backends');
		}

		return b as Quantity<T>;
	}
	return a.createQuantity(b);
}

function product<T, C extends object>(a: Quantity<T, C>, input: QuantityInput<T>, divide: boolean): Quantity<T, C>
{
	const n = a.numeric;

	if (typeof input === 'number' || n.isValue(input))
	{
		const b = n.from(input);
		if (a.isTemperature())
		{
			return scaleTemperature(a, b, divide, a);
		}

		return a.createResult(divide ? n.div(a.scalar, b) : n.mul(a.scalar, b), a);
	}

	const b = operand(a, input);

	if (b.isUnitless())
	{
		if (a.isTemperature())
		{
			return scaleTemperature(a, b.scalar, divide, a);
		}

		return a.createResult(divide ? n.div(a.scalar, b.scalar) : n.mul(a.scalar, b.scalar), a);
	}
	const aUnitless = a.isUnitless();

	if (!divide && aUnitless)
	{
		if (b.isTemperature())
		{
			return scaleTemperature(b, a.scalar, false, a);
		}

		return a.createResult(n.mul(a.scalar, b.scalar), b);
	}

	if (a.isTemperature() || b.isTemperature())
	{
		throw new Error(divide ? 'Cannot divide with temperatures' : 'Cannot multiply by temperatures');
	}

	const aligned = !aUnitless && a.isCompatible(b) && a.signature !== TEMPERATURE_SIGNATURE;
	const rightUnits = aligned ? a : b;
	const [numerator, denominator] = combinePowers(a, rightUnits, divide);
	const scalar = aligned && !sameUnits(a, b, a.cacheScope) ? scaledProduct(a, b, divide, n, a.cacheScope)
		: divide ? n.div(a.scalar, b.scalar) : n.mul(a.scalar, b.scalar);

	return a.createResult(scalar, { numerator, denominator });
}

/** Multiply quantities using the selected numeric backend. */
export function mul<T, C extends object>(a: Quantity<T, C>, input: QuantityInput<T>): Quantity<T, C>
{
	return product(a, input, false);
}

/** Divide quantities using the selected numeric backend. */
export function div<T, C extends object>(a: Quantity<T, C>, input: QuantityInput<T>): Quantity<T, C>
{
	return product(a, input, true);
}

export function pow<T, C extends object>(a: Quantity<T, C>, value: string | number | T): Quantity<T, C>
{
	const power = integerExponent(a.numeric, value);

	if (!power)
	{
		return a.createResult(a.numeric.from(1), { numerator: UNITY, denominator: UNITY });
	}

	if (power === 1 && a.isTemperature())
	{
		return a.createResult(a.scalar, a);
	}

	const [numerator, denominator] = cancelPowers(
		scalePowers(power < 0 ? a.denominator : a.numerator, Math.abs(power)),
		scalePowers(power < 0 ? a.numerator : a.denominator, Math.abs(power)));

	return a.createResult(a.numeric.powInteger(a.scalar, power), { numerator, denominator });
}

export function inverse<T, C extends object>(a: Quantity<T, C>): Quantity<T, C>
{
	if (a.isTemperature())
	{
		throw new Error('Cannot divide with temperatures');
	}

	if (a.numeric.compare(a.scalar, a.numeric.from(0)) === 0)
	{
		throw new Error('Divide by zero');
	}

	return a.createResult(a.numeric.div(a.numeric.from(1), a.scalar), { numerator: a.denominator, denominator: a.numerator });
}
