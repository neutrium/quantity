import { isTemperature } from './temperature-units.js';
import { validateTemperatureSum, subtractTemperatures, changeTemperature, scaleTemperature } from './temperature.js';
import { acceptsNumericOperand } from '../numeric/backend.js';
import { Quantity, type QuantityOperand } from '../QuantityCore.js';
import { throwIncompatibleUnits } from './errors.js';
import { scaledSum, scaledProduct } from './unit-scale.js';
import { sameUnits } from './unit-identity.js';
import { integerAsNumber, rationalPower } from '../numeric/support.js';
import type { UnitExponent } from '../QuantityDefinition.js';
import { arithmeticResultUnits, cancelPowers, combinePowers, powerUnitSides, UNITY } from './unit-powers.js';
import { TEMPERATURE_SIGNATURE } from './unit-signatures.js';

/** Validate backend, dimensions and temperature rules before converting or adding scalars. */
function sum<T, C extends object>(a: Quantity<T, C>, input: QuantityOperand<T>, subtract: boolean): Quantity<T, C>
{
	const b = operand(a, input);

	if (!a.isCompatible(b))
	{
		throwIncompatibleUnits();
	}

	const aTemperature = isTemperature(a), bTemperature = isTemperature(b);
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
export function add<T, C extends object>(a: Quantity<T, C>, input: QuantityOperand<T>): Quantity<T, C>
{
	return sum(a, input, false);
}

/** Subtract a compatible operand after validation and conversion to the receiver’s units. */
export function sub<T, C extends object>(a: Quantity<T, C>, input: QuantityOperand<T>): Quantity<T, C>
{
	return sum(a, input, true);
}

export function operand<T>(a: Quantity<T>, b: QuantityOperand<T>): Quantity<T>
{
	const other = b instanceof Quantity ? b : a.createQuantity(b);
	if (!acceptsNumericOperand(a.numeric, other.numeric, other.scalar))
	{
		throw new TypeError('Cannot mix numeric backends');
	}
	return other as Quantity<T>;
}

function product<T, C extends object>(a: Quantity<T, C>, input: QuantityOperand<T>, divide: boolean): Quantity<T, C>
{
	const n = a.numeric;

	if (typeof input === 'number' || typeof input === 'bigint' || (!(input instanceof Quantity) && n.isValue(input)))
	{
		const b = n.from(input);
		if (isTemperature(a))
		{
			return scaleTemperature(a, b, divide, a);
		}

		return a.createResult(divide ? n.div(a.scalar, b) : n.mul(a.scalar, b), a);
	}

	const b = operand(a, input);

	if (isTemperature(a) || isTemperature(b))
	{
		if (!b.numerator.length && !b.denominator.length)
		{
			return scaleTemperature(a, b.scalar, divide, a);
		}

		if (!divide && !a.numerator.length && !a.denominator.length)
		{
			return scaleTemperature(b, a.scalar, false, a);
		}

		throw new Error(divide ? 'Cannot divide with temperatures' : 'Cannot multiply by temperatures');
	}
	if (b.isUnitless())
	{
		return a.createResult(divide ? n.div(a.scalar, b.scalar) : n.mul(a.scalar, b.scalar), a);
	}
	const aUnitless = a.isUnitless();

	if (!divide && aUnitless)
	{
		return a.createResult(n.mul(a.scalar, b.scalar), b);
	}

	const aligned = !aUnitless && a.isCompatible(b) && a.signature !== TEMPERATURE_SIGNATURE;
	const rightUnits = aligned ? a : b;
	const [numerator, denominator] = combinePowers(a, rightUnits, divide);
	const units = arithmeticResultUnits(numerator, denominator, a.cacheScope);
	const scalar = aligned && !sameUnits(a, b, a.cacheScope) ? scaledProduct(a, b, divide, n, a.cacheScope)
		: divide ? n.div(a.scalar, b.scalar) : n.mul(a.scalar, b.scalar);

	return a.createResult(scalar, units);
}

/** Multiply quantities using the selected numeric backend. */
export function mul<T, C extends object>(a: Quantity<T, C>, input: QuantityOperand<T>): Quantity<T, C>
{
	return product(a, input, false);
}

/** Divide quantities using the selected numeric backend. */
export function div<T, C extends object>(a: Quantity<T, C>, input: QuantityOperand<T>): Quantity<T, C>
{
	return product(a, input, true);
}

export function pow<T, C extends object>(a: Quantity<T, C>, power: UnitExponent): Quantity<T, C>
{
	if (!power)
	{
		return a.createResult(a.numeric.from(1), { numerator: UNITY, denominator: UNITY });
	}

	if (isTemperature(a))
	{
		if (power === 1) return a.createResult(a.scalar, a);
		throw new Error('Cannot raise absolute temperatures to powers');
	}

	const [top, bottom] = powerUnitSides(a, power);
	const [numerator, denominator] = cancelPowers(top, bottom);

	const units = arithmeticResultUnits(numerator, denominator, a.cacheScope);

	return a.createResult(rationalPower(a.numeric, a.scalar, power), units);
}

export function inverse<T, C extends object>(a: Quantity<T, C>): Quantity<T, C>
{
	if (isTemperature(a))
	{
		throw new Error('Cannot divide with temperatures');
	}

	if (integerAsNumber(a.numeric, a.scalar) === 0)
	{
		throw new Error('Divide by zero');
	}

	return a.createResult(a.numeric.div(a.numeric.from(1), a.scalar), { numerator: a.denominator, denominator: a.numerator });
}
