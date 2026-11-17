import { normalizeExponent, addExponents, multiplyExponents, negateExponent, exponentSign, equalExponents } from './exponents.js';
import type { UnitPower, UnitStructure, UnitExponent } from '../QuantityDefinition.js';
import { UNITS } from '../data/Units.js';
import { UnitTokenManager } from '../UnitTokenManager.js';
import { LruCache } from '@neutrium/utilities/cache';
import type { CacheScope } from '../utils/CacheScope.js';
import { unitKey } from './unit-identity.js';
import { unitSignature } from './unit-signatures.js';

// Frozen sides retain a conservative exponent bound so completed pairs can be
// checked again without walking the records.
const normalized = new WeakMap<readonly UnitPower[], number>();
export const UNITY: readonly UnitPower[] = Object.freeze([]);
normalized.set(UNITY, 0);

function freezePowers(units: UnitPower[]): readonly UnitPower[]
{
	if (!units.length)
	{
		return UNITY;
	}

	let maximum = 0;

	for (const term of units)
	{
		Object.freeze(term);
		const exponent = term.exponent;
		// Each positive exponent is at most MAX_SAFE_INTEGER, so its ceiling fits exactly.
		const bound = typeof exponent === 'number' ? exponent
			: Number((exponent.numerator - 1n) / exponent.denominator + 1n);

		if (bound > maximum)
		{
			maximum = bound;
		}
	}

	Object.freeze(units);
	normalized.set(units, maximum);

	return units;
}

/** Copy external records once; immutable internal arrays can subsequently be shared. */
export function normalizePowers(units: unknown): readonly UnitPower[]
{
	if (!Array.isArray(units))
	{
		throw new TypeError('Expected an array of counted unit records');
	}

	if (normalized.has(units))
	{
		return units;
	}

	if (!units.length) return UNITY;

	const tm = UnitTokenManager.instance;
	const counts = new Map<string, UnitPower>();

	for (let i = 0; i < units.length; i++)
	{
		const term: UnitPower = units[i];

		if (!term || typeof term !== 'object')
		{
			throw new TypeError('Expected a counted unit record with unit and exponent');
		}

		const { unit, prefix } = term;
		const exponent = normalizeExponent(term.exponent);

		if (exponentSign(exponent) <= 0)
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

		if (previous)
		{
			counts.set(key, { ...previous, exponent: addExponents(previous.exponent, exponent) });
		}
		else
		{
			counts.set(key, { unit, ...(prefix === undefined ? {} : { prefix }), exponent });
		}
	}

	return freezePowers([...counts.values()]);
}

// One unit record contributes at most this many base tokens, even when inverted.
const maxBaseTokens = Math.max(...Object.values(UNITS).map(category =>
	(category.numerator?.length ?? 0) + (category.denominator?.length ?? 0)));

function mayOverflowBaseCounts(num: readonly UnitPower[], den: readonly UnitPower[]): boolean
{
	const limit = Math.floor(2 ** 52 / (maxBaseTokens * (num.length + den.length)));
	// Reserve one bit of headroom in this approximate bound. Larger records get the exact check.
	return normalized.get(num)! > limit || normalized.get(den)! > limit;
}

/** Check large normalized counts before their expanded dimensions can cancel. */
function validateBaseCounts(num: readonly UnitPower[], den: readonly UnitPower[]): void
{
	if ((num.length || den.length) && mayOverflowBaseCounts(num, den))
	{
		baseCounts(num, den);
	}
}

/** Complete a normalized pair, including intermediate groups before a reducing power. */
export function completeNormalizedUnits<U extends UnitStructure>(units: U): U
{
	validateBaseCounts(units.numerator, units.denominator);
	return units;
}

/** Canonical base units and their validated signature can be passed directly to a result. */
export class BaseUnitMetadata implements UnitStructure
{
	readonly signature: string;

	constructor(readonly numerator: readonly UnitPower[], readonly denominator: readonly UnitPower[])
	{
		this.signature = unitSignature(this);
		Object.freeze(this);
	}
}

const baseUnitKey = Symbol();

export function baseUnitMetadata(units: UnitStructure, scope: CacheScope): BaseUnitMetadata
{
	const cache = scope.get('metadata', baseUnitKey, () => new LruCache<string, BaseUnitMetadata>());
	const key = cache ? unitKey(units, scope) : '';
	const existing = cache?.get(key);

	if (existing)
	{
		return existing;
	}

	const [numerator, denominator] = basePowers(units);
	const result = new BaseUnitMetadata(numerator, denominator);
	cache?.set(key, result);

	return result;
}

/** Carry the target's checked dimensions through result construction. */
export class ExpandedResultUnits implements UnitStructure
{
	readonly base: BaseUnitMetadata;

	constructor(readonly numerator: readonly UnitPower[], readonly denominator: readonly UnitPower[], scope: CacheScope)
	{
		this.base = baseUnitMetadata(this, scope);
		Object.freeze(this);
	}
}

export function arithmeticResultUnits(numerator: readonly UnitPower[], denominator: readonly UnitPower[], scope: CacheScope): UnitStructure
{
	return (numerator.length || denominator.length) && mayOverflowBaseCounts(numerator, denominator)
		? new ExpandedResultUnits(numerator, denominator, scope) : { numerator, denominator };
}

/** Detach external records and validate the resulting dimensions, excluding physical temperature rules. */
export function completeUnitStructure(num: unknown, den: unknown): UnitStructure
{
	return completeNormalizedUnits({ numerator: normalizePowers(num), denominator: normalizePowers(den) });
}

/** Combine equal unit/prefix pairs and cancel numerator against denominator. */
export function cancelPowers(num: readonly UnitPower[], den: readonly UnitPower[]): [readonly UnitPower[], readonly UnitPower[]]
{
	num = normalizePowers(num);
	den = normalizePowers(den);

	if (num === den)
	{
		validateBaseCounts(num, den);
		return [UNITY, UNITY];
	}

	if (!den.length || !num.length || (num.length === 1 && den.length === 1 &&
		(num[0].unit !== den[0].unit || num[0].prefix !== den[0].prefix)))
	{
		return [num, den];
	}

	const counts = new Map<string, { term: UnitPower; exponent: UnitExponent }>();

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

		counts.set(key, { term, exponent: addExponents(previous?.exponent ?? 0, negateExponent(term.exponent)) });
	}

	// Normalized sides are unique and immutable; retain their identities if nothing cancels.
	if (!overlaps)
	{
		return [num, den];
	}

	validateBaseCounts(num, den);

	const numerator: UnitPower[] = [], denominator: UnitPower[] = [];

	for (const { term, exponent } of counts.values())
	{
		if (exponentSign(exponent) > 0)
		{
			numerator.push(equalExponents(exponent, term.exponent) ? term : { ...term, exponent });
		}
		else if (exponentSign(exponent) < 0)
		{
			const magnitude = negateExponent(exponent);
			denominator.push(equalExponents(magnitude, term.exponent) ? term : { ...term, exponent: magnitude });
		}
	}

	return [freezePowers(numerator), freezePowers(denominator)];
}

function appendBaseCounts(terms: readonly UnitPower[], exponent: UnitExponent, counts: Map<string, UnitExponent>): void
{
	for (const term of terms)
	{
		counts.set(term.unit, addExponents(counts.get(term.unit) ?? 0, multiplyExponents(term.exponent, exponent)));
	}
}

/** Add one catalog unit to the two expanded sides, preserving counts before cancellation. */
export function accumulateBasePower({ unit, exponent }: UnitPower, top: Map<string, UnitExponent>, bottom: Map<string, UnitExponent>): void
{
	const definition = UnitTokenManager.instance.getUnit(unit)!;
	appendBaseCounts(definition.numerator, exponent, top);
	appendBaseCounts(definition.denominator, exponent, bottom);
}

function baseCounts(numerator: readonly UnitPower[], denominator: readonly UnitPower[]): [Map<string, UnitExponent>, Map<string, UnitExponent>]
{
	const num = new Map<string, UnitExponent>(), den = new Map<string, UnitExponent>();

	for (const term of numerator)
	{
		accumulateBasePower(term, num, den);
	}

	for (const term of denominator)
	{
		accumulateBasePower(term, den, num);
	}

	return [num, den];
}

/** Expand catalog dimensions into counts, allocating records only for surviving base units. */
export function basePowers(units: UnitStructure): [readonly UnitPower[], readonly UnitPower[]]
{
	const [num, den] = baseCounts(normalizePowers(units.numerator), normalizePowers(units.denominator));
	// Check each side before cancellation, and retain numerator-first insertion
	// order even when an overlapping unit leaves a denominator remainder.
	for (const [unit, exponent] of den)
	{
		num.set(unit, addExponents(num.get(unit) ?? 0, negateExponent(exponent)));
	}

	const baseNum: UnitPower[] = [], baseDen: UnitPower[] = [];

	for (const [unit, exponent] of num)
	{
		if (exponentSign(exponent) > 0)
		{
			baseNum.push({ unit, exponent });
		}
		else if (exponentSign(exponent) < 0)
		{
			baseDen.push({ unit, exponent: negateExponent(exponent) });
		}
	}

	// Catalog base tokens are trusted; counts are already unique and checked.
	return [freezePowers(baseNum), freezePowers(baseDen)];
}

/** Apply a normalized signed power to both sides. Parsing and Quantity.pow validate external exponents. */
export function powerUnitSides(units: UnitStructure, power: UnitExponent): [readonly UnitPower[], readonly UnitPower[]]
{
	const inverse = exponentSign(power) < 0;
	const magnitude = inverse ? negateExponent(power) : power;

	return [
		scalePowers(inverse ? units.denominator : units.numerator, magnitude),
		scalePowers(inverse ? units.numerator : units.denominator, magnitude),
	];
}

function scalePowers(units: readonly UnitPower[], multiplier: UnitExponent): readonly UnitPower[]
{
	if (!multiplier || !units.length)
	{
		return UNITY;
	}

	if (multiplier === 1)
	{
		return normalizePowers(units);
	}

	const scaled = units.map(term => ({ ...term, exponent: multiplyExponents(term.exponent, multiplier) }));
	// Positive rational scaling preserves validated tokens, order and uniqueness.
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
		counts.set(key, previous ? { ...term, exponent: addExponents(previous.exponent, term.exponent) } : term);
	}

	return freezePowers([...counts.values()]);
}

/** Combine product/quotient units without concatenating or revalidating normalized records. */
export function combinePowers(left: UnitStructure, right: UnitStructure, divide: boolean): [readonly UnitPower[], readonly UnitPower[]]
{
	if (divide && left === right)
	{
		const num = normalizePowers(left.numerator), den = normalizePowers(left.denominator);

		if ((num.length || den.length) && mayOverflowBaseCounts(num, den))
		{
			// Both sides of the quotient contain the same sums. Validate them once.
			const side = mergePowers(num, den);
			baseCounts(side, side);
		}

		return [UNITY, UNITY];
	}

	return cancelPowers(
		mergePowers(left.numerator, divide ? right.denominator : right.numerator),
		mergePowers(left.denominator, divide ? right.numerator : right.denominator));
}
