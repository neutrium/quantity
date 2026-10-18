import { scale, compareUnitValues } from './unit-scale.js';
import { temperatureBaseScalar, temperatureTargetScalar, compareTemperatures } from './temperature.js';
import { Quantity } from '../QuantityCore.js';
import { operand } from './arithmetic.js';
import { sameUnits } from './unit-identity.js';
import { throwIncompatibleUnits } from './errors.js';

export function compare<T>(a: Quantity<T>, input: string | number | T | Quantity<T>): -1 | 0 | 1 | undefined
{
	const n = a.numeric;
	if (!(input instanceof Quantity) && typeof input !== 'string' && typeof input !== 'number' && !n.isValue(input))
	{
		throw new TypeError('Expected a numeric scalar, Quantity, or quantity expression');
	}

	let comparison;

	if (typeof input === 'number' || n.isValue(input))
	{
		comparison = n.compare(a.scalar, n.from(input));
	}
	else
	{
		const b = operand(a, input);
		if (!a.isCompatible(b))
		{
			throwIncompatibleUnits();
		}

		// Matching temperature scales can have different represented boundaries across contexts.
		comparison = sameUnits(a, b, a.cacheScope) && (n === b.numeric || !a.isTemperature()) ? n.compare(a.scalar, b.scalar)
			: a.isTemperature() || b.isTemperature() ? compareTemperatures(a, b)
			: compareUnitValues(a, b, n, a.cacheScope);
	}

	return Number.isNaN(comparison) ? undefined : comparison < 0 ? -1 : comparison > 0 ? 1 : 0;
}

export function convert<T>(a: Quantity<T>, target: Quantity<unknown>, reciprocal: boolean): T
{
	const n = a.numeric;

	if (reciprocal && n.compare(a.scalar, n.from(0)) === 0)
	{
		throw new Error('Divide by zero');
	}

	if (target.isTemperature())
	{
		return temperatureTargetScalar(a, target, reciprocal);
	}

	return scale(a.scalar, a, target, n, reciprocal, a.cacheScope);
}

/** Evaluate a scalar in base units, including absolute-temperature offsets. */
export function base<T>(a: Quantity<T>): T
{
	return a.isTemperature() ? temperatureBaseScalar(a) : scale(a.scalar, a, undefined, a.numeric, false, a.cacheScope);
}
