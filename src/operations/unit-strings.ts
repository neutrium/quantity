import { CacheScope, defaultCacheScope } from '../utils/CacheScope.js';
import type { UnitPower, UnitStructure } from '../QuantityDefinition.js';
import { UnitTokenManager } from '../UnitTokenManager.js';

const numeratorKey = Symbol();
const denominatorKey = Symbol();

/** Format a normalized, immutable unit structure with optional per-side caching. */
export function formatUnits(units: UnitStructure, scope: CacheScope): string
{
	if (!units.numerator.length && !units.denominator.length)
	{
		return '';
	}

	const stringify = scope.enabled('metadata') ? stringifyCachedUnits : stringifyUnits;
	const numerator = stringify(units.numerator, '*', scope);

	return units.denominator.length
		? numerator + '/' + stringify(units.denominator, '.', scope)
		: numerator;
}

function stringifyCachedUnits(units: readonly UnitPower[], separator: '*' | '.', scope: CacheScope): string
{
	if (!units.length)
	{
		return '1';
	}

	const cache = scope.get('metadata', separator === '*' ? numeratorKey : denominatorKey,
		() => new WeakMap<readonly UnitPower[], string>());
	const cached = cache?.get(units);

	if (cached !== undefined)
	{
		return cached;
	}

	const result = stringifyUnits(units, separator, scope);
	cache?.set(units, result);
	return result;
}

export function stringifyUnits(units: readonly UnitPower[], separator = '*', scope: CacheScope = defaultCacheScope): string
{
	if (!units.length)
	{
		return '1';
	}

	const tm = UnitTokenManager.instance;

	return units.map(({ unit, prefix, exponent }) =>
		tm.getUnitOutput(unit, prefix, scope) + (exponent === 1 ? '' : exponent)).join(separator);
}
