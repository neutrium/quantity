import { exponentKey } from './exponents.js';
import { CacheScope, defaultCacheScope } from '../utils/CacheScope.js';
import type { UnitStructure, UnitPower } from '../QuantityDefinition.js';

// Quantity owns frozen, normalized arrays. Weak keys allow their identities to
// be reused by clones and arithmetic without retaining discarded definitions.
const sideKeysKey = Symbol();
interface UnitIdentity
{
	readonly key: string;
	recent?: { target: WeakRef<UnitIdentity>; reciprocal: boolean; key: string };
}
const identitiesKey = Symbol();
const baseIdentity: UnitIdentity = { key: '' };

function identity(units: UnitStructure, scope: CacheScope): UnitIdentity
{
	const identities = scope.get('metadata', identitiesKey, () => new WeakMap<readonly UnitPower[], WeakMap<readonly UnitPower[], UnitIdentity>>());
	let denominators = identities?.get(units.numerator);
	let result = denominators?.get(units.denominator);

	if (!result)
	{
		const sideKeys = scope.get('metadata', sideKeysKey, () => new WeakMap<readonly UnitPower[], string>());
		result = { key: sideKey(units.numerator, sideKeys) + '/' + sideKey(units.denominator, sideKeys) };

		if (identities)
		{
			if (!denominators)
			{
				identities.set(units.numerator, denominators = new WeakMap());
			}

			denominators.set(units.denominator, result);
		}
	}

	return result;
}

function sideKey(units: readonly UnitPower[], sideKeys: WeakMap<readonly UnitPower[], string> | undefined): string
{
	let key = sideKeys?.get(units);

	if (key === undefined)
	{
		key = JSON.stringify(units.map(({ unit, prefix, exponent }) => [unit, prefix ?? null, typeof exponent === 'number' ? exponent : exponentKey(exponent)]));
		sideKeys?.set(units, key);
	}

	return key;
}

// Keep the two sides and their term order distinct, as with the original unit
// expression comparison. Display aliases are deliberately absent from identity.
export function unitKey(units: UnitStructure, scope: CacheScope = defaultCacheScope): string
{
	return identity(units, scope).key;
}

/** Reuse one recent pair key per live unit structure, never a cached plan/result. */
export function conversionKey(source: UnitStructure, target: UnitStructure | undefined, reciprocal: boolean, scope: CacheScope = defaultCacheScope): string
{
	const from = identity(source, scope), to = target ? identity(target, scope) : baseIdentity;
	const recent = from.recent;

	if (recent && recent.reciprocal === reciprocal && recent.target.deref() === to)
	{
		return recent.key;
	}

	const key = JSON.stringify([from.key, target ? to.key : null, reciprocal]);
	// Bound extra text per live structure and avoid retaining the target's arrays
	// or identity. Alternating targets replace this slot; plan eviction stays in
	// the byte-budgeted conversion cache, which every conversion still consults.
	if (scope.enabled('metadata') && key.length <= 4096)
	{
		from.recent = { target: new WeakRef(to), reciprocal, key };
	}
	else
	{
		from.recent = undefined;
	}

	return key;
}

export function sameUnits(a: UnitStructure, b: UnitStructure, scope: CacheScope = defaultCacheScope): boolean
{
	const sameNumerator = a.numerator === b.numerator, sameDenominator = a.denominator === b.denominator;

	if (sameNumerator && sameDenominator)
	{
		return true;
	}

	// Different record counts cannot match; avoid allocating keys or cache storage.
	if (a.numerator.length !== b.numerator.length || a.denominator.length !== b.denominator.length)
	{
		return false;
	}

	// Resolve the cache once; uncached comparisons need no serialized keys or temporary unit arrays.
	const sideKeys = scope.get('metadata', sideKeysKey, () => new WeakMap<readonly UnitPower[], string>());
	if (!sideKeys)
	{
		return (sameNumerator || comparePowers(a.numerator, b.numerator) === 0) &&
			(sameDenominator || comparePowers(a.denominator, b.denominator) === 0);
	}

	return (sameNumerator || sideKey(a.numerator, sideKeys) === sideKey(b.numerator, sideKeys)) &&
		(sameDenominator || sideKey(a.denominator, sideKeys) === sideKey(b.denominator, sideKeys));
}

/** Stable choice of comparison units independent of scalars, cache settings and operand order. */
export function compareUnitOrder(a: UnitStructure, b: UnitStructure): number
{
	return comparePowers(a.numerator, b.numerator) || comparePowers(a.denominator, b.denominator);
}

function comparePowers(a: readonly UnitPower[], b: readonly UnitPower[]): number
{
	if (a === b)
	{
		return 0;
	}

	if (a.length !== b.length)
	{
		return a.length - b.length;
	}

	for (let i = 0; i < a.length; i++)
	{
		const left = a[i], right = b[i];

		if (left.unit !== right.unit)
		{
			return left.unit < right.unit ? -1 : 1;
		}

		if (left.prefix !== right.prefix)
		{
			return (left.prefix ?? '') < (right.prefix ?? '') ? -1 : 1;
		}

		const x = left.exponent, y = right.exponent;

		if (x === y)
		{
			continue;
		}

		if (typeof x === 'number')
		{
			return typeof y === 'number' ? x - y : -1;
		}

		if (typeof y === 'number')
		{
			return 1;
		}

		if (x.numerator !== y.numerator)
		{
			return x.numerator < y.numerator ? -1 : 1;
		}

		if (x.denominator !== y.denominator)
		{
			return x.denominator < y.denominator ? -1 : 1;
		}
	}

	return 0;
}
