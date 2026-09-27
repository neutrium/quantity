import type { UnitPower } from '../QuantityDefinition.js';
import { UnitTokenManager } from '../UnitTokenManager.js';

const normalized = new WeakSet<readonly UnitPower[]>();
export const UNITY: readonly UnitPower[] = Object.freeze([]);
normalized.add(UNITY);

/** Reject rounding/overflow before dimensional counts lose integer precision. */
export function checkedExponent(value: number): number
{
	if (!Number.isSafeInteger(value))
	{
		throw new RangeError('Unit exponent must be a safe integer');
	}

	return value;
}

function freezePowers(units: UnitPower[]): readonly UnitPower[]
{
	if (!units.length) return UNITY;
	for (const term of units) Object.freeze(term);
	Object.freeze(units);
	normalized.add(units);
	return units;
}

/** Copy external records once; immutable internal arrays can subsequently be shared. */
export function normalizePowers(units: readonly UnitPower[]): readonly UnitPower[]
{
	if (normalized.has(units))
	{
		return units;
	}

	if (!Array.isArray(units))
	{
		throw new TypeError('Expected an array of counted unit records');
	}

	const tm = UnitTokenManager.instance;
	const counts = new Map<string, UnitPower>();

	for (const term of units)
	{
		if (!term || typeof term !== 'object')
		{
			throw new TypeError('Expected a counted unit record with unit and exponent');
		}

		const { unit, prefix, exponent } = term;
		checkedExponent(exponent);

		if (exponent <= 0)
		{
			throw new RangeError('Unit exponent must be positive; use the denominator for negative powers');
		}

		if (typeof unit !== 'string' || (prefix !== undefined && typeof prefix !== 'string'))
		{
			throw new TypeError('Unit and prefix tokens must be strings');
		}
		const definition = tm.getUnit(unit);

		if (!definition || definition.category === 'prefix' ||
			(prefix !== undefined && tm.getUnit(prefix)?.category !== 'prefix'))
		{
			throw new Error('Unit not recognized');
		}

		if (unit === '<1>' && prefix === undefined)
		{
			continue;
		}
		const key = (prefix ?? '') + unit;
		const previous = counts.get(key);
		counts.set(key, { unit, ...(prefix === undefined ? {} : { prefix }), exponent: previous ? checkedExponent(previous.exponent + exponent) : exponent });
	}

	return freezePowers([...counts.values()]);
}

/** Combine equal unit/prefix pairs and cancel numerator against denominator. */
export function cancelPowers(num: readonly UnitPower[], den: readonly UnitPower[]): [readonly UnitPower[], readonly UnitPower[]]
{
	num = normalizePowers(num);
	den = normalizePowers(den);

	if (!den.length || !num.length)
	{
		return [num, den];
	}

	const counts = new Map<string, { term: UnitPower; exponent: number }>();

	for (const term of num)
	{
		counts.set((term.prefix ?? '') + term.unit, { term, exponent: term.exponent });
	}

	for (const term of den)
	{
		const key = (term.prefix ?? '') + term.unit;
		const previous = counts.get(key);
		counts.set(key, { term, exponent: checkedExponent((previous?.exponent ?? 0) - term.exponent) });
	}

	const numerator: UnitPower[] = [], denominator: UnitPower[] = [];

	for (const { term, exponent } of counts.values())
	{
		if (exponent > 0)
		{
			numerator.push({ ...term, exponent });
		}
		else if (exponent < 0)
		{
			denominator.push({ ...term, exponent: -exponent });
		}
	}

	return [freezePowers(numerator), freezePowers(denominator)];
}

export function scalePowers(units: readonly UnitPower[], multiplier: number): readonly UnitPower[]
{
	checkedExponent(multiplier);

	if (multiplier < 0)
	{
		throw new RangeError('Expected a nonnegative unit multiplier');
	}

	if (!multiplier || !units.length)
	{
		return UNITY;
	}

	if (multiplier === 1)
	{
		return normalizePowers(units);
	}

	return normalizePowers(units.map(term => ({ ...term, exponent: checkedExponent(term.exponent * multiplier) })));
}
