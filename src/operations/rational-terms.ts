import type { ArithmeticAdapter } from '@neutrium/math/numeric/arithmetic';
import type { NumericAdapter } from '@neutrium/math/adapters/contracts';
import { CacheScope, defaultCacheScope } from '../utils/CacheScope.js';
import { hasRationalConstruction, hasRationalComparison, hasRationalExtraction, evaluateRational, type RationalComparison, type RationalConstruction, type RationalExtraction, type RationalTerm, type RationalValue } from '@neutrium/math/numeric/rational';
import { integerAsNumber, scalarBytes } from '../numeric/support.js';
import { GenerationalWeakCache } from '@neutrium/utilities/cache';

/** Extraction describes a scalar; the receiver also needs construction to round calculated terms. */
export function canSumRationalTerms<T>(numeric: ArithmeticAdapter<T>): numeric is ArithmeticAdapter<T> & RationalExtraction<T> & RationalConstruction<T>
{
	return hasRationalExtraction(numeric) && hasRationalConstruction(numeric);
}

export function canCompareRationalTerms<T>(numeric: ArithmeticAdapter<T>): numeric is ArithmeticAdapter<T> & RationalExtraction<T> & RationalComparison
{
	return hasRationalExtraction(numeric) && hasRationalComparison(numeric);
}

/** Refine bounds until both endpoints round to the same scalar, including the sign of zero. */
export function evaluateRoundedScalar<T>(numeric: NumericAdapter<T>, values: readonly RationalValue[], evaluate: (terms: RationalTerm[]) => T): T
{
	return evaluateRational(values, evaluate, {
		equal: (lower, upper) => numeric.compare(lower, upper) === 0
			&& (integerAsNumber(numeric, lower) !== 0 || Object.is(numeric.toNumber(lower), numeric.toNumber(upper))),
	});
}

// Compare a positive ratio directly so integer division cannot truncate a difference.
export function compareRatioToOne({ numerator, denominator, exponent }: RationalTerm): number
{
	if (exponent !== 0n)
	{
		const order = BigInt(numerator.toString().length - denominator.toString().length) + exponent;
		if (order !== 0n) return order > 0n ? 1 : -1;
		// When orders coincide, this expansion is bounded by the existing coefficients.
		if (exponent > 0n) numerator *= 10n ** exponent;
		else denominator *= 10n ** -exponent;
	}
	return numerator < denominator ? -1 : numerator > denominator ? 1 : 0;
}

// Cache exact extraction by immutable scalar and adapter. Admission uses numeric
// storage size, so public formatting limits never participate in a calculation.
const scalarTermsKey = Symbol();
const maxCachedScalarBytes = 4096;
const scalarGenerationSize = 1024;

export function scalarTerm<T>(value: T, n: NumericAdapter<T> & RationalExtraction<T>, scope: CacheScope = defaultCacheScope): RationalTerm
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
