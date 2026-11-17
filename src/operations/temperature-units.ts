import type { UnitStructure } from '../QuantityDefinition.js';

/** Physical checks on intermediate expressions that are absent from the final unit records. */
export const temperatureChecks = Symbol('temperatureChecks');

export interface ParsedTemperatureChecks<T>
{
	[temperatureChecks]?: string | Error | { unit: string; scalar: T }[];
}

export function isDegrees(a: UnitStructure): boolean
{
	return a.numerator.length === 1 && a.denominator.length === 0 &&
		a.numerator[0].exponent === 1 && !a.numerator[0].prefix &&
		/^(<temp-[CFRK]>|<(kelvin|celsius|rankine|fahrenheit)>)$/.test(a.numerator[0].unit);
}

export function isTemperature(a: UnitStructure): boolean
{
	return a.numerator.length === 1 && !a.denominator.length && a.numerator[0].exponent === 1 &&
		!a.numerator[0].prefix && a.numerator[0].unit.startsWith('<temp-');
}

/** Absolute temperature tokens must stand alone, including in dimension-only expressions. */
function temperatureUnitError(units: UnitStructure): string | undefined
{
	if (units.denominator.some(term => term.unit.startsWith("<temp-")))
	{
		return 'Cannot divide with temperatures';
	}

	if (units.numerator.some(term => term.unit.startsWith("<temp-")))
	{
		if (units.numerator.length > 1 || units.numerator[0].exponent !== 1 || units.numerator[0].prefix !== undefined)
		{
			return 'Cannot multiply by temperatures';
		}

		if (units.denominator.length !== 0)
		{
			return 'Cannot divide with temperatures';
		}
	}
}

export function validateTemperatureUnits(units: UnitStructure): void
{
	const error = temperatureUnitError(units);

	if (error)
	{
		throw new Error(error);
	}
}
