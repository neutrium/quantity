import { integerAsNumber, scalarSign } from '../numeric/support.js';
import type { NumericAdapter } from '@neutrium/math/numeric/core';
import { gcdBigInt, lcmBigInt } from '@neutrium/utilities/integer';
import { rootedValue } from '@neutrium/math/numeric/roots';
import { CacheScope, defaultCacheScope } from '../utils/CacheScope.js';
import type { ArithmeticAdapter } from '@neutrium/math/numeric/arithmetic';
import type { UnitStructure } from '../QuantityDefinition.js';
import type { FactorValue, ScaleFactor } from '../data/ScaleFactor.js';
import { UnitTokenManager } from '../UnitTokenManager.js';
import { unitKey, conversionKey, compareUnitOrder } from './unit-identity.js';
import { copyCacheText } from '../utils/cache-memory.js';
import { BudgetCache } from '@neutrium/utilities/cache';
import { canCompareRationalTerms, canSumRationalTerms, evaluateRoundedScalar, scalarTerm, compareRatioToOne } from './rational-terms.js';
import { addFactor, reduceFactors, factorRatio, factoredValue, type Factors, type RationalValue, type RationalTerm } from '@neutrium/math/numeric/factors';
import { parseRationalTerm, scaleTerm, multiplyValue, negateValue, evaluateRational, rationalToScalar, type RationalComparison, type RationalConstruction, type RationalExtraction } from '@neutrium/math/numeric/rational';

function factorBytes(factors: ReadonlyMap<bigint, bigint>, rooted = false): number
{
	let bytes = 128;

	for (const [factor, power] of factors)
	{
		const digits = factor.toString().length;
		bytes += 96 + 2 * (digits + power.toString().length);

		// Root bounds retain an owned factor map or its expanded coefficients.
		if (rooted)
		{
			bytes += 96 + 2 * digits * Math.abs(Number(power));
		}
	}

	return bytes;
}

const plansKey = Symbol();
const conversionsKey = Symbol();
const adapterFactorsKey = Symbol();

interface ConversionPlan
{
	readonly degree: bigint;
	readonly factors: ReadonlyMap<bigint, bigint>;
	readonly exponent: bigint;
	readonly exact?: readonly [bigint, bigint];
	readonly root?: RationalValue;
}

/** Normalize catalog constants before backend conversion; never serialize a live scalar. */
function boundedAdapterFactor<T>(plan: ConversionPlan, n: ArithmeticAdapter<T>): T
{
	let value: RationalValue;

	if (plan.root)
	{
		value = plan.root;
	}
	else if (plan.exact)
	{
		value = { exact: { numerator: plan.exact[0], denominator: plan.exact[1], exponent: plan.exponent } };
	}
	else
	{
		const factors = new Map(plan.factors);
		addFactor(factors, 10n, plan.exponent);
		value = factoredValue(factors);
	}

	return rationalToScalar(n, value);
}

/** Catalog factors may be exact; live scalars and calculated factors stay in the backend. */
function adapterFactor<T>(plan: ConversionPlan, n: ArithmeticAdapter<T>, scope: CacheScope): T
{
	const adapters = scope.get('conversionPlans', adapterFactorsKey, () => new WeakMap<object, WeakMap<ConversionPlan, number>>());
	let factors = adapters?.get(n);
	const cached = factors?.get(plan);
	if (cached !== undefined) return cached as T;
	let value: T;
	if (plan.exact && Number.isSafeInteger(Number(plan.exponent)))
	{
		value = n.div(n.from(plan.exact[0]), n.from(plan.exact[1]));
		if (plan.exponent)
		{
			value = n.mul(value, n.powInteger(n.from(10), Number(plan.exponent)));
		}

		// Catalog factors are strictly positive. Zero/nonfinite intermediates may
		// hide a representable factor, so retry with bounded scientific literals.
		if (!n.isFinite(value) || integerAsNumber(n, value) === 0)
		{
			value = boundedAdapterFactor(plan, n);
		}
	}
	else
	{
		value = boundedAdapterFactor(plan, n);
	}

	// Unknown object scalars have no reliable size estimate; retain only fixed-size primitives.
	if (adapters && typeof value === 'number')
	{
		if (!factors)
		{
			adapters.set(n, factors = new WeakMap());
		}

		factors.set(plan, value);
	}

	return value;
}
// Cache only catalog data, never scalars or backend-rounded results. A byte
// budget also bounds retention of long unit keys and large exact coefficients.
function conversionCache(scope: CacheScope)
{
	return scope.get('conversionPlans', conversionsKey, () => new BudgetCache<ConversionPlan>(scope.config.conversionPlans, {
		detachKey: copyCacheText,
		measure: plan => Math.min(Number.MAX_SAFE_INTEGER, factorBytes(plan.factors, !!plan.root)
			+ 2 * (plan.exponent.toString().length + plan.degree.toString().length)
			+ (plan.exact ? 2 * (plan.exact[0].toString().length + plan.exact[1].toString().length) : 0)),
	}));
}

function conversionPlan(source: UnitStructure, target: UnitStructure | undefined, reciprocal: boolean, scope: CacheScope): ConversionPlan
{
	const conversions = conversionCache(scope);
	const key = conversions ? conversionKey(source, target, reciprocal, scope) : '';
	const cached = conversions?.get(key);

	if (cached)
	{
		return cached;
	}

	const sourcePlan = unitFactors(source, scope), targetPlan = target ? unitFactors(target, scope) : undefined;
	let degree = targetPlan ? lcmBigInt(sourcePlan.degree, targetPlan.degree) : sourcePlan.degree;
	const factors: Factors = new Map();
	for (const [factor, count] of sourcePlan.factors) addFactor(factors, factor, count * (degree / sourcePlan.degree) * (reciprocal ? -1n : 1n));
	if (targetPlan) for (const [factor, count] of targetPlan.factors) addFactor(factors, factor, -count * (degree / targetPlan.degree));
	reduceFactors(factors);

	if (degree !== 1n)
	{
		let common = degree;

		for (const count of factors.values())
		{
			common = gcdBigInt(common, count < 0n ? -count : count);
		}

		if (common !== 1n)
		{
			degree /= common;
			for (const [factor, count] of factors) factors.set(factor, count / common);
		}
	}
	const exponent = factors.get(10n) ?? 0n;
	const root = degree === 1n ? undefined : rootedValue(factors, degree);
	factors.delete(10n);
	let plan: ConversionPlan;

	if (root && 'exact' in root)
	{
		const { numerator, denominator, exponent } = root.exact;
		plan = { factors: new Map([[numerator, 1n], [denominator, -1n]]), exponent, degree: 1n, exact: [numerator, denominator] };
	}
	else
	{
		plan = { factors, exponent, degree, root, exact: root ? undefined : factorRatio(factors) };
	}

	conversions?.set(key, plan);

	return plan;
}

function accumulate(factors: Factors, value: FactorValue, power: bigint): void
{
	if (value === 1 || value === 1n)
	{
		return;
	}

	if (typeof value === 'bigint' || (typeof value === 'number' && Number.isSafeInteger(value)))
	{
		addFactor(factors, BigInt(value), power);
		return;
	}

	const term = parseRationalTerm(String(value));
	addFactor(factors, term.numerator, power);
	addFactor(factors, 10n, term.exponent * power);
}

interface UnitFactorPlan { readonly factors: ReadonlyMap<bigint, bigint>; readonly degree: bigint; }

function unitFactors(units: UnitStructure, scope: CacheScope): UnitFactorPlan
{
	const plans = scope.get('unitFactors', plansKey, () => new BudgetCache<UnitFactorPlan>(scope.config.unitFactors, { detachKey: copyCacheText, measure: plan => factorBytes(plan.factors) + 2 * plan.degree.toString().length }));
	const key = plans ? unitKey(units, scope) : '';
	let plan = plans?.get(key);

	if (plan)
	{
		return plan;
	}

	const factors: Factors = new Map();
	const tm = UnitTokenManager.instance;
	let degree = 1n;

	for (const terms of [units.numerator, units.denominator]) for (const term of terms)
	{
		if (typeof term.exponent !== 'number') degree = lcmBigInt(degree, term.exponent.denominator);
	}

	const factor = (value: ScaleFactor, count: bigint) => {
		if (Array.isArray(value))
		{
			accumulate(factors, value[0], count); accumulate(factors, value[1], -count);
		}
		else
		{
			accumulate(factors, value as FactorValue, count);
		}
	};

	for (const [terms, sign] of [[units.numerator, 1n], [units.denominator, -1n]] as const)
	{
		for (const term of terms)
		{
			const count = typeof term.exponent === 'number' ? BigInt(term.exponent) * degree * sign
				: term.exponent.numerator * (degree / term.exponent.denominator) * sign;
			factor(tm.getUnit(term.unit)!.scalar, count);

			if (term.prefix)
			{
				factor(tm.getUnit(term.prefix)!.scalar, count);
			}
		}
	}

	plan = { factors: reduceFactors(factors), degree };
	plans?.set(key, plan);

	return plan;
}

/** Prepare a finite value or reciprocal in base units, without rounding or range checks. */
export function baseUnitValue<T>(value: UnitStructure & {scalar: T}, n: NumericAdapter<T> & RationalExtraction<T>, reciprocal: boolean, scope: CacheScope): RationalValue
{
	const term = scalarTerm(value.scalar, n, scope);

	if (!term.numerator)
	{
		if (reciprocal)
		{
			throw new Error('Divide by zero');
		}

		return { exact: term };
	}

	return scaledTerm(term, value, undefined, reciprocal, scope);
}

/** Apply the catalog scale to a represented finite scalar term. */
export function scaledTerm(term: RationalTerm, source: UnitStructure, target: UnitStructure | undefined,
	reciprocal: boolean, scope: CacheScope): RationalValue
{
	return applyPlan(term, conversionPlan(source, target, reciprocal, scope), reciprocal);
}

function applyPlan(term: RationalTerm, plan: ConversionPlan, reciprocal = false): RationalValue
{
	const scalar = reciprocal
		? scaleTerm({ numerator: term.denominator, denominator: 1n, exponent: -term.exponent }, 1n, term.numerator)
		: term;
	const { exact, exponent } = plan;

	if (plan.root)
	{
		return multiplyValue(plan.root, scalar);
	}
	if (exact)
	{
		return {
			exact: {
				numerator: scalar.numerator * exact[0],
				denominator: scalar.denominator * exact[1],
				exponent: scalar.exponent + exponent
			}
		};
	}
	// Copy before adding scalar factors; cached catalog plans must stay immutable.
	const factors = new Map(plan.factors);
	addFactor(factors, 10n, exponent);
	addFactor(factors, scalar.numerator < 0n ? -scalar.numerator : scalar.numerator, 1n);
	addFactor(factors, scalar.denominator, -1n);
	addFactor(factors, 10n, scalar.exponent);

	return factoredValue(factors, scalar.numerator < 0n);
}

/** True when the catalog conversion cancels exactly, independently of scalar precision. */
export function sameUnitScale(a: UnitStructure, b: UnitStructure, scope: CacheScope): boolean
{
	return isIdentityPlan(conversionPlan(a, b, false, scope));
}

function isIdentityPlan(plan: ConversionPlan): boolean
{
	return plan.exact !== undefined && compareRatioToOne({
		numerator: plan.exact[0], denominator: plan.exact[1], exponent: plan.exponent,
	}) === 0;
}

export function scale<T>(value: T, source: UnitStructure, target: UnitStructure | undefined, n: ArithmeticAdapter<T>, reciprocal = false, scope: CacheScope = defaultCacheScope, preserveReading = false): T
{
	if (!n.isFinite(value) || integerAsNumber(n, value) === 0)
	{
		return reciprocal ? n.div(n.from(1), value) : value;
	}

	const plan = conversionPlan(source, target, reciprocal, scope);
	if (preserveReading && !reciprocal && isIdentityPlan(plan)) return value;
	return scaleFiniteNonzero(value, plan, n, reciprocal, scope);
}

function scaleFiniteNonzero<T>(value: T, plan: ConversionPlan, n: ArithmeticAdapter<T>, reciprocal: boolean, scope: CacheScope): T
{
	if (!canSumRationalTerms(n))
	{
		const factor = adapterFactor(plan, n, scope);
		return reciprocal ? n.div(factor, value) : n.mul(value, factor);
	}

	return scaledValueToScalar(n, applyPlan(scalarTerm(value, n, scope), plan, reciprocal));
}

/** Exact plans have one term; only a bounded factor needs adaptive evaluation. */
function scaledValueToScalar<T>(n: ArithmeticAdapter<T> & RationalConstruction<T>, value: RationalValue): T
{
	return 'exact' in value ? n.fromRationalSum([value.exact]) : rationalToScalar(n, value);
}

/** Add/subtract in the left operand's units using the receiver's arithmetic. */
export function scaledSum<T>(a: UnitStructure & {scalar: T}, b: UnitStructure & {scalar: T}, subtract: boolean, n: ArithmeticAdapter<T>, scope: CacheScope): T
{
	if (!n.isFinite(a.scalar) || !n.isFinite(b.scalar))
	{
		return subtract ? n.sub(a.scalar, b.scalar) : n.add(a.scalar, b.scalar);
	}

	if (!canSumRationalTerms(n))
	{
		const right = scale(b.scalar, b, a, n, false, scope);
		return subtract ? n.sub(a.scalar, right) : n.add(a.scalar, right);
	}

	if (integerAsNumber(n, a.scalar) === 0 && integerAsNumber(n, b.scalar) === 0)
	{
		return subtract ? n.sub(a.scalar, b.scalar) : n.add(a.scalar, b.scalar);
	}

	const left = scalarTerm(a.scalar, n, scope);
	const rightTerm = scalarTerm(b.scalar, n, scope);

	if (rightTerm.numerator === 0n)
	{
		return n.fromRationalSum([left]);
	}

	const plan = conversionPlan(b, a, false, scope);
	const right = applyPlan(rightTerm, plan);

	if ('exact' in right)
	{
		return n.fromRationalSum([left, subtract ? scaleTerm(right.exact, -1n) : right.exact]);
	}

	// Opposite signs cancel exactly when their magnitude ratio reduces to one.
	// Bounds alone may straddle zero at every precision in that case.
	if (left.numerator !== 0n && (left.numerator < 0n) !== ((rightTerm.numerator < 0n) !== subtract))
	{
		const ratio = magnitudeRatioFactors(plan, rightTerm, left);
		if (reduceFactors(ratio).size === 0)
		{
			return n.sub(a.scalar, a.scalar);
		}
	}

	return evaluateRoundedScalar(n, [{ exact: left }, subtract ? negateValue(right) : right], terms => n.fromRationalSum(terms));
}

/** Multiply/divide both scalars and their relative unit scale before final rounding. */
export function scaledProduct<T>(a: UnitStructure & {scalar: T}, b: UnitStructure & {scalar: T}, divide: boolean, n: ArithmeticAdapter<T>, scope: CacheScope): T
{
	// Positive catalog scales preserve signs, zero and infinity. Let the
	// backend handle exceptional arithmetic without materializing the scale.
	if (!n.isFinite(a.scalar) || !n.isFinite(b.scalar) ||
		integerAsNumber(n, a.scalar) === 0 || integerAsNumber(n, b.scalar) === 0)
	{
		return divide ? n.div(a.scalar, b.scalar) : n.mul(a.scalar, b.scalar);
	}

	if (!canSumRationalTerms(n))
	{
		const factor = adapterFactor(conversionPlan(b, a, false, scope), n, scope);
		return divide ? n.div(n.div(a.scalar, b.scalar), factor) : n.mul(n.mul(a.scalar, b.scalar), factor);
	}

	const left = scalarTerm(a.scalar, n, scope), right = scalarTerm(b.scalar, n, scope);
	// Choose the factor in the direction in which it multiplies the scalar result.
	const plan = divide ? conversionPlan(a, b, false, scope) : conversionPlan(b, a, false, scope);

	if (plan.root || plan.exact)
	{
		const scalar = divide
			? scaleTerm({ ...left, exponent: left.exponent - right.exponent }, right.denominator, right.numerator)
			: scaleTerm({ ...left, exponent: left.exponent + right.exponent }, right.numerator, right.denominator);

		return scaledValueToScalar(n, applyPlan(scalar, plan));
	}

	const direction = divide ? -1n : 1n;
	const factors = new Map(plan.factors);

	addFactor(factors, 10n, left.exponent + direction * right.exponent + plan.exponent);
	addFactor(factors, left.numerator < 0n ? -left.numerator : left.numerator, 1n);
	addFactor(factors, left.denominator, -1n);
	addFactor(factors, right.numerator < 0n ? -right.numerator : right.numerator, direction);
	addFactor(factors, right.denominator, -direction);

	return scaledValueToScalar(n, factoredValue(factors, (left.numerator < 0n) !== (right.numerator < 0n)));
}

/** Compare the exact ratio, cancelling common factors before bounded evaluation. */
export function compareUnitValues<T>(a: UnitStructure & {scalar: T}, b: UnitStructure & {scalar: T}, n: ArithmeticAdapter<T>, scope: CacheScope): number
{
	const sa = scalarSign(n, a.scalar), sb = scalarSign(n, b.scalar);

	if (!n.isFinite(a.scalar) || !n.isFinite(b.scalar) || !sa || !sb || sa !== sb)
	{
		return n.compare(a.scalar, b.scalar);
	}

	if (!canCompareRationalTerms(n))
	{
		if (compareUnitOrder(a, b) <= 0)
		{
			const plan = conversionPlan(b, a, false, scope);
			return n.compare(a.scalar, scaleFiniteNonzero(b.scalar, plan, n, false, scope));
		}

		const plan = conversionPlan(a, b, false, scope);

		return n.compare(scaleFiniteNonzero(a.scalar, plan, n, false, scope), b.scalar);
	}

	return sa * compareMagnitudes(a, b, n, scope);
}

/** Inputs are finite and nonzero; compare magnitudes without adapter negation. */
function compareMagnitudes<T>(a: UnitStructure & {scalar: T}, b: UnitStructure & {scalar: T}, n: NumericAdapter<T> & RationalExtraction<T> & RationalComparison, scope: CacheScope): number
{
	const plan = conversionPlan(a, b, false, scope);
	const left = scalarTerm(a.scalar, n, scope), right = scalarTerm(b.scalar, n, scope);

	if (plan.exact)
	{
		const scaled = {
			numerator: (left.numerator < 0n ? -left.numerator : left.numerator) * plan.exact[0],
			denominator: left.denominator * plan.exact[1],
			exponent: left.exponent + plan.exponent,
		};
		const magnitude = right.numerator < 0n ? -right.numerator : right.numerator;

		return n.compareRationalSum([scaled, { ...right, numerator: -magnitude }]);
	}
	const ratio = factoredValue(magnitudeRatioFactors(plan, left, right));
	return evaluateRational([ratio], ([term]) =>
		n.compareRationalSum([term, { numerator: -1n, denominator: 1n, exponent: 0n }]));
}

/** Factors of the positive source/target ratio raised to the plan's common root degree. */
function magnitudeRatioFactors(plan: ConversionPlan, source: RationalTerm, target: RationalTerm): Factors
{
	const factors = new Map(plan.factors);
	addFactor(factors, 10n, plan.exponent);

	for (const [term, sign] of [[source, 1n], [target, -1n]] as const)
	{
		addFactor(factors, term.numerator < 0n ? -term.numerator : term.numerator, sign * plan.degree);
		addFactor(factors, term.denominator, -sign * plan.degree);
		addFactor(factors, 10n, term.exponent * sign * plan.degree);
	}

	return factors;
}
