import { CacheScope, defaultCacheScope } from '../utils/CacheScope.js';
import type { ArithmeticAdapter } from '@neutrium/utilities/numeric/arithmetic';
import type { UnitStructure } from '../QuantityDefinition.js';
import type { FactorValue, ScaleFactor } from '../data/ScaleFactor.js';
import { UnitTokenManager } from '../UnitTokenManager.js';
import { unitKey, conversionKey } from './unit-identity.js';
import { copyCacheText } from '../utils/cache-memory.js';
import { BudgetCache } from '@neutrium/utilities/cache';
import { scalarTerm, finish } from './exact-sum.js';
import { addFactor, reduceFactors, factorRatio, factoredValue, type Factors, type RationalValue } from '@neutrium/utilities/numeric/factors';
import { parseRationalTerm, scaleTerm, negateValue, evaluateRational, hasRationalArithmetic, type RationalArithmeticAdapter } from '@neutrium/utilities/numeric/rational';

function factorBytes(factors: ReadonlyMap<bigint, bigint>): number
{
	let bytes = 128;

	for (const [factor, power] of factors)
	{
		bytes += 96 + 2 * (factor.toString().length + power.toString().length);
	}

	return bytes;
}

const plansKey = Symbol();
const conversionsKey = Symbol();
const adapterFactorsKey = Symbol();

interface ConversionPlan
{
	readonly factors: ReadonlyMap<bigint, bigint>;
	readonly exponent: bigint;
	readonly exact?: readonly [bigint, bigint];
}

/** Catalog factors may be exact; live scalars and calculated factors stay in the backend. */
function adapterFactor<T>(plan: ConversionPlan, n: ArithmeticAdapter<T>, scope: CacheScope): T
{
	const adapters = scope.get('conversionPlans', adapterFactorsKey, () => new WeakMap<object, WeakMap<ConversionPlan, number>>());
	let factors = adapters?.get(n);
	const cached = factors?.get(plan);
	if (cached !== undefined) return cached as T;
	let value: T;
	if (plan.exact)
	{
		value = n.div(n.from(plan.exact[0]), n.from(plan.exact[1]));
	}
	else
	{
		value = n.from(1);
		for (const [factor, count] of plan.factors)
		{
			value = n.mul(value, n.powInteger(n.from(factor), Number(count)));
		}
	}

	if (plan.exponent)
	{
		value = n.mul(value, n.powInteger(n.from(10), Number(plan.exponent)));
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
		measure: plan => factorBytes(plan.factors) + 2 * plan.exponent.toString().length
			+ (plan.exact ? 2 * (plan.exact[0].toString().length + plan.exact[1].toString().length) : 0),
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

	const factors: Factors = new Map();
	appendUnits(factors, source, reciprocal ? -1n : 1n, scope);

	if (target)
	{
		appendUnits(factors, target, -1n, scope);
	}

	reduceFactors(factors);
	const exponent = factors.get(10n) ?? 0n;
	factors.delete(10n);
	const plan = { factors, exponent, exact: factorRatio(factors) };
	conversions?.set(key, plan);

	return plan;
}

function accumulate(factors: Factors, value: FactorValue, power: bigint): void
{
	const term = parseRationalTerm(String(value));
	addFactor(factors, term.numerator < 0n ? -term.numerator : term.numerator, power);
	addFactor(factors, 10n, term.exponent * power);
}

function unitFactors(units: UnitStructure, scope: CacheScope): ReadonlyMap<bigint, bigint>
{
	const plans = scope.get('unitFactors', plansKey, () => new BudgetCache<ReadonlyMap<bigint, bigint>>(scope.config.unitFactors, { detachKey: copyCacheText, measure: factorBytes }));
	const key = plans ? unitKey(units, scope) : '';
	let plan = plans?.get(key);

	if (plan)
	{
		return plan;
	}

	const factors: Factors = new Map();
	const tm = UnitTokenManager.instance;
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
			const count = BigInt(term.exponent) * sign;
			factor(tm.getUnit(term.unit)!.scalar, count);

			if (term.prefix)
			{
				factor(tm.getUnit(term.prefix)!.scalar, count);
			}
		}
	}

	plan = reduceFactors(factors);
	plans?.set(key, plan);

	return plan;
}

function appendUnits(factors: Factors, units: UnitStructure, sign: bigint, scope: CacheScope): void
{
	for (const [factor, count] of unitFactors(units, scope))
	{
		addFactor(factors, factor, count * sign);
	}
}

/** Prepare a finite value or reciprocal in target units, without rounding or range checks. */
export function unitValue<T>(value: UnitStructure & {scalar: T}, target: UnitStructure | undefined, n: RationalArithmeticAdapter<T>, reciprocal = false, scope: CacheScope = defaultCacheScope): RationalValue
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

	const plan = conversionPlan(value, target, reciprocal, scope);
	const { exact, exponent } = plan;

	if (exact)
	{
		const scalar = reciprocal
			? scaleTerm({ numerator: term.denominator, denominator: 1n, exponent: -term.exponent }, 1n, term.numerator)
			: term;

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
	addFactor(factors, term.numerator < 0n ? -term.numerator : term.numerator, reciprocal ? -1n : 1n);
	addFactor(factors, term.denominator, reciprocal ? 1n : -1n);
	addFactor(factors, 10n, term.exponent * (reciprocal ? -1n : 1n));

	return factoredValue(factors, term.numerator < 0n);
}

export function scale<T>(value: T, source: UnitStructure, target: UnitStructure | undefined, n: ArithmeticAdapter<T>, reciprocal = false, scope: CacheScope = defaultCacheScope): T
{
	if (!n.isFinite(value) || n.compare(value, n.from(0)) === 0)
	{
		return reciprocal ? n.div(n.from(1), value) : value;
	}

	if (!hasRationalArithmetic(n))
	{
		const factor = adapterFactor(conversionPlan(source, target, reciprocal, scope), n, scope);
		return reciprocal ? n.div(factor, value) : n.mul(value, factor);
	}

	return finish(unitValue({ numerator: source.numerator, denominator: source.denominator, scalar: value }, target, n, reciprocal, scope), n);
}

/** Add/subtract in the left operand's units, rounding the complete sum once. */
export function scaledSum<T>(a: UnitStructure & {scalar: T}, b: UnitStructure & {scalar: T}, subtract: boolean, n: ArithmeticAdapter<T>, scope: CacheScope = defaultCacheScope): T
{
	if (!hasRationalArithmetic(n))
	{
		const right = scale(b.scalar, b, a, n, false, scope);
		return subtract ? n.sub(a.scalar, right) : n.add(a.scalar, right);
	}

	const zero = n.from(0);

	if (!n.isFinite(a.scalar) || !n.isFinite(b.scalar) ||
		n.compare(a.scalar, zero) === 0 && n.compare(b.scalar, zero) === 0)
	{
		return subtract ? n.sub(a.scalar, b.scalar) : n.add(a.scalar, b.scalar);
	}

	const left = { exact: scalarTerm(a.scalar, n, scope) };
	const right = unitValue(b, a, n, false, scope);
	// Independent bounds cannot prove exact cancellation of huge powers.
	// Cancel their magnitude symbolically before attempting refinement.
	if (left.exact.numerator !== 0n && !('exact' in right) &&
		(n.compare(a.scalar, zero) < 0) !== ((n.compare(b.scalar, zero) < 0) !== subtract) &&
		compareMagnitudes(a, b, n, scope) === 0)
	{
		return n.sub(n.from(1), n.from(1));
	}

	return evaluateRational([left, subtract ? negateValue(right) : right], terms => n.fromRationalSum(terms),
		{ equal: (a, b) => n.compare(a, b) === 0 });
}

/** Multiply/divide both scalars and their relative unit scale before final rounding. */
export function scaledProduct<T>(a: UnitStructure & {scalar: T}, b: UnitStructure & {scalar: T}, divide: boolean, n: ArithmeticAdapter<T>, scope: CacheScope = defaultCacheScope): T
{
	if (!hasRationalArithmetic(n))
	{
		const factor = adapterFactor(conversionPlan(b, a, false, scope), n, scope);
		return divide ? n.div(n.div(a.scalar, b.scalar), factor) : n.mul(n.mul(a.scalar, b.scalar), factor);
	}

	const zero = n.from(0);
	// Positive catalog scales preserve signs, zero and infinity. Let the
	// backend handle exceptional arithmetic without materializing the scale.
	if (!n.isFinite(a.scalar) || !n.isFinite(b.scalar) ||
		n.compare(a.scalar, zero) === 0 || n.compare(b.scalar, zero) === 0)
	{
		return divide ? n.div(a.scalar, b.scalar) : n.mul(a.scalar, b.scalar);
	}

	const left = scalarTerm(a.scalar, n, scope), right = scalarTerm(b.scalar, n, scope);
	const plan = conversionPlan(b, a, false, scope);

	if (plan.exact)
	{
		const [num, den] = plan.exact;
		const term = divide
			? scaleTerm({ ...left, exponent: left.exponent - right.exponent - plan.exponent }, right.denominator * den, right.numerator * num)
			: scaleTerm({ ...left, exponent: left.exponent + right.exponent + plan.exponent }, right.numerator * num, right.denominator * den);
		return n.fromRationalSum([term]);
	}

	const direction = divide ? -1n : 1n;
	const factors: Factors = new Map();

	for (const [factor, count] of plan.factors)
	{
		factors.set(factor, divide ? -count : count);
	}

	addFactor(factors, 10n, left.exponent + direction * (right.exponent + plan.exponent));
	addFactor(factors, left.numerator < 0n ? -left.numerator : left.numerator, 1n);
	addFactor(factors, left.denominator, -1n);
	addFactor(factors, right.numerator < 0n ? -right.numerator : right.numerator, direction);
	addFactor(factors, right.denominator, -direction);

	return finish(factoredValue(factors, (left.numerator < 0n) !== (right.numerator < 0n)), n);
}

/** Compare the exact ratio, cancelling common factors before bounded evaluation. */
export function compareUnitValues<T>(a: UnitStructure & {scalar: T}, b: UnitStructure & {scalar: T}, n: ArithmeticAdapter<T>, scope: CacheScope = defaultCacheScope): number
{
	if (!hasRationalArithmetic(n))
	{
		return n.compare(a.scalar, scale(b.scalar, b, a, n, false, scope));
	}

	const zero = n.from(0), sa = n.compare(a.scalar, zero), sb = n.compare(b.scalar, zero);

	if (!n.isFinite(a.scalar) || !n.isFinite(b.scalar) || !sa || !sb || sa !== sb)
	{
		return n.compare(a.scalar, b.scalar);
	}

	return sa * compareMagnitudes(a, b, n, scope);
}

/** Inputs are finite and nonzero; compare magnitudes without adapter negation. */
function compareMagnitudes<T>(a: UnitStructure & {scalar: T}, b: UnitStructure & {scalar: T}, n: RationalArithmeticAdapter<T>, scope: CacheScope): number
{
	const plan = conversionPlan(a, b, false, scope);

	if (plan.exact)
	{
		const left = scalarTerm(a.scalar, n, scope), right = scalarTerm(b.scalar, n, scope);
		// Compare |a| in b's units directly with |b|, without forming or reducing a ratio.
		return n.compareRationalSum([
			{
				numerator: (left.numerator < 0n ? -left.numerator : left.numerator) * plan.exact[0],
				denominator: left.denominator * plan.exact[1],
				exponent: left.exponent + plan.exponent,
			},
			{
				numerator: right.numerator < 0n ? right.numerator : -right.numerator,
				denominator: right.denominator,
				exponent: right.exponent,
			},
		]);
	}
	const factors = new Map(plan.factors);
	addFactor(factors, 10n, plan.exponent);

	for (const [value, sign] of [[a.scalar, 1n], [b.scalar, -1n]] as const)
	{
		const term = scalarTerm(value, n, scope);
		addFactor(factors, term.numerator < 0n ? -term.numerator : term.numerator, sign);
		addFactor(factors, term.denominator, -sign);
		addFactor(factors, 10n, term.exponent * sign);
	}

	return evaluateRational([factoredValue(factors, false)], ([term]) =>
		n.compareRationalSum([term, { numerator: -1n, denominator: 1n, exponent: 0n }]));
}
