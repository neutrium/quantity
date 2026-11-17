import { isTemperature } from './temperature-units.js';
import { hasZeroTemperatureOffset } from './temperature-boundary.js';
import { scale, compareUnitValues } from './unit-scale.js';
import { temperatureBaseScalar, compareTemperatures } from './temperature.js';
import { Quantity } from '../QuantityCore.js';
import { operand } from './arithmetic.js';
import type { UnitStructure } from '../QuantityDefinition.js';
import { sameUnits } from './unit-identity.js';
import { throwIncompatibleUnits } from './errors.js';

export function compare<T>(a: Quantity<T>, input: string | number | T | Quantity<T>): -1 | 0 | 1 | undefined
{
	const n = a.numeric;
	let comparison;

	if (typeof input === 'number' || (!(input instanceof Quantity) && n.isValue(input)))
	{
		comparison = n.compare(a.scalar, n.from(input));
	}
	else
	{
		if (!(input instanceof Quantity) && typeof input !== 'string')
		{
			throw new TypeError('Expected a numeric scalar, Quantity, or quantity expression');
		}

		const b = operand(a, input);

		if (!a.isCompatible(b))
		{
			throwIncompatibleUnits();
		}

		// Matching temperature scales can have different represented boundaries across contexts.
		const absolute = isTemperature(a);
		comparison = absolute || isTemperature(b) ? compareTemperatures(a, b, absolute)
			: sameUnits(a, b, a.cacheScope) ? n.compare(a.scalar, b.scalar)
			: compareUnitValues(a, b, n, a.cacheScope);
	}

	return Number.isNaN(comparison) ? undefined : comparison < 0 ? -1 : comparison > 0 ? 1 : 0;
}

export function convert<T>(a: Quantity<T>, target: UnitStructure, reciprocal: boolean): T
{
	const preserveReading = isTemperature(a) && hasZeroTemperatureOffset(a);
	return scale(a.scalar, a, target, a.numeric, reciprocal, a.cacheScope, preserveReading);
}

/** Evaluate a scalar in base units, including absolute-temperature offsets. */
export function base<T>(a: Quantity<T>): T
{
	if (isTemperature(a))
	{
		return a.numerator[0].unit === '<temp-K>' ? a.scalar : temperatureBaseScalar(a);
	}

	return a.isBase() ? a.scalar : scale(a.scalar, a, undefined, a.numeric, false, a.cacheScope);
}
