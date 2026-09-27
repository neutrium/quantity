import type { UnitPower } from '../QuantityDefinition.js';
import { UnitTokenManager } from '../UnitTokenManager.js';

export function stringifyUnits(units: readonly UnitPower[], separator = '*'): string
{
	if (!units.length)
	{
		return '1';
	}

	const tm = UnitTokenManager.instance;

	return units.map(({ unit, prefix, exponent }) =>
		tm.getUnitOutput(unit, prefix) + (exponent === 1 ? '' : exponent)).join(separator);
}
