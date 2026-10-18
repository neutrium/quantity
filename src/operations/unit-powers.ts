import type { UnitPower, UnitStructure } from '../QuantityDefinition.js';
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

	let overlaps = false;

	for (const term of den)
	{
		const key = (term.prefix ?? '') + term.unit;
		const previous = counts.get(key);

		if (previous)
		{
			overlaps = true;
		}

		counts.set(key, { term, exponent: checkedExponent((previous?.exponent ?? 0) - term.exponent) });
	}

	// Normalized sides are unique and immutable; retain their identities if nothing cancels.
	if (!overlaps)
	{
		return [num, den];
	}

	const numerator: UnitPower[] = [], denominator: UnitPower[] = [];

	for (const { term, exponent } of counts.values())
	{
		if (exponent > 0)
		{
			numerator.push(exponent === term.exponent ? term : { ...term, exponent });
		}
		else if (exponent < 0)
		{
			denominator.push(-exponent === term.exponent ? term : { ...term, exponent: -exponent });
		}
	}

	return [freezePowers(numerator), freezePowers(denominator)];
}

/** Expand catalog dimensions into counts, allocating records only for surviving base units. */
export function basePowers(units: UnitStructure): [readonly UnitPower[], readonly UnitPower[]]
{
	const numerator = normalizePowers(units.numerator), denominator = normalizePowers(units.denominator);
	const num = new Map<string, number>(), den = new Map<string, number>();
	const tm = UnitTokenManager.instance;
	const append = (terms: readonly UnitPower[], exponent: number, counts: Map<string, number>) => {
		for (const term of terms)
		{
			// Positive counts mean the total check also rejects an overflowing product.
			counts.set(term.unit, checkedExponent((counts.get(term.unit) ?? 0) + term.exponent * exponent));
		}
	};
	const accumulate = (terms: readonly UnitPower[], top: Map<string, number>, bottom: Map<string, number>) => {
		for (const { unit, exponent } of terms)
		{
			const definition = tm.getUnit(unit)!;
			append(definition.numerator, exponent, top);
			append(definition.denominator, exponent, bottom);
		}
	};
	accumulate(numerator, num, den);
	accumulate(denominator, den, num);
	// Check each side before cancellation, and retain numerator-first insertion
	// order even when an overlapping unit leaves a denominator remainder.
	for (const [unit, exponent] of den) num.set(unit, (num.get(unit) ?? 0) - exponent);
	const baseNum: UnitPower[] = [], baseDen: UnitPower[] = [];

	for (const [unit, exponent] of num)
	{
		if (exponent > 0)
		{
			baseNum.push({ unit, exponent });
		}
		else if (exponent < 0)
		{
			baseDen.push({ unit, exponent: -exponent });
		}
	}
	// Catalog base tokens are trusted; counts are already unique and checked.
	return [freezePowers(baseNum), freezePowers(baseDen)];
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

	const scaled = units.map(term => ({ ...term, exponent: checkedExponent(term.exponent * multiplier) }));
	// Positive integer scaling preserves validated tokens, order and uniqueness.
	// External arrays still need validation and coalescing after scaling.
	return normalized.has(units) ? freezePowers(scaled) : normalizePowers(scaled);
}

/** Merge already-normalized sides, preserving order and checking sums before cancellation. */
function mergePowers(left: readonly UnitPower[], right: readonly UnitPower[]): readonly UnitPower[]
{
	left = normalizePowers(left);
	right = normalizePowers(right);
	if (!left.length)
	{
		return right;
	}

	if (!right.length)
	{
		return left;
	}

	const counts = new Map<string, UnitPower>();
	for (const term of left)
	{
		counts.set((term.prefix ?? '') + term.unit, term);
	}

	for (const term of right)
	{
		const key = (term.prefix ?? '') + term.unit;
		const previous = counts.get(key);
		counts.set(key, previous ? { ...term, exponent: checkedExponent(previous.exponent + term.exponent) } : term);
	}

	return freezePowers([...counts.values()]);
}

/** Combine product/quotient units without concatenating or revalidating normalized records. */
export function combinePowers(left: UnitStructure, right: UnitStructure, divide: boolean): [readonly UnitPower[], readonly UnitPower[]]
{
	return cancelPowers(
		mergePowers(left.numerator, divide ? right.denominator : right.numerator),
		mergePowers(left.denominator, divide ? right.numerator : right.denominator));
}
