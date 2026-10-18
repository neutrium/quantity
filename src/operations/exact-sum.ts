import { CacheScope, defaultCacheScope } from '../utils/CacheScope.js';
import { evaluateRational, type RationalArithmeticAdapter, type RationalTerm, type RationalValue } from '@neutrium/utilities/numeric/rational';
import { scalarBytes } from '../numeric/support.js';
import { GenerationalWeakCache } from '@neutrium/utilities/cache';

// Cache exact extraction by immutable scalar and adapter. Admission uses numeric
// storage size, so public formatting limits never participate in a calculation.
const scalarTermsKey = Symbol();
const maxCachedScalarBytes = 4096;
const scalarGenerationSize = 1024;

export function scalarTerm<T>(value: T, n: RationalArithmeticAdapter<T>, scope: CacheScope = defaultCacheScope): RationalTerm
{
	const scalarTerms = value !== null && typeof value === 'object'
		? scope.get('scalarTerms', scalarTermsKey, () => new WeakMap<object, GenerationalWeakCache<object, RationalTerm>>())
		: undefined;
	let cache = scalarTerms?.get(n);
	const cached = cache?.get(value as object);
	if (cached)
	{
		return cached;
	}

	const term = n.toRationalTerm(value);

	if (scalarTerms && scalarBytes(n, value) <= maxCachedScalarBytes)
	{
		if (!cache)
		{
			scalarTerms.set(n, cache = new GenerationalWeakCache(scalarGenerationSize));
		}

		cache.set(value as object, term);
	}
	return term;
}

export function finish<T>(value: RationalValue, n: RationalArithmeticAdapter<T>): T
{
	return evaluateRational([value], terms => n.fromRationalSum(terms), { equal: (a, b) => n.compare(a, b) === 0 });
}
