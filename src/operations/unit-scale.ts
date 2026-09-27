import { Decimal } from '@neutrium/decimal';
import type { QuantityDefinition, UnitStructure } from '../QuantityDefinition.js';
import type { FactorValue, ScaleFactor } from '../data/ScaleFactor.js';
import { UnitTokenManager } from '../UnitTokenManager.js';
import { calculateScalar, type DecimalConstructor } from './numeric-context.js';
import { unitKey } from './unit-identity.js';
import { LruCache } from '../utils/LruCache.js';
import { decimalTerm, scaleTerm, roundSum, compareSum, evaluateRational, negateValue, type RationalTerm, type RationalValue } from './exact-sum.js';

type Factors = Map<bigint, bigint>;
interface ScaledValue { coefficient: Decimal; exponent: bigint; }
// Exact input serialization must not depend on public formatting or exponent limits.
const Exact = Decimal.clone({ precision: 64, maxOutputDigits: Decimal.limits.maxDigits,
	minE: -Decimal.limits.maxExponent, maxE: Decimal.limits.maxExponent });
const plans = new LruCache<string, ReadonlyMap<bigint, bigint>>();
const exactBaseFactors = new WeakMap<object, LruCache<string, Decimal | null>>();

function addFactor(factors: Factors, value: bigint, power: bigint): void
{
	if (value === 1n || power === 0n)
	{
		return;
	}

	const count = (factors.get(value) ?? 0n) + power;

	if (count)
	{
		factors.set(value, count);
	}
	else
	{
		factors.delete(value);
	}
}

function accumulate(factors: Factors, value: FactorValue, power: bigint): void
{
	const [mantissa, exponent] = new Exact(value).abs().toExponential().split('e');
	const digits = mantissa.replace('.', '');
	addFactor(factors, BigInt(digits), power);
	addFactor(factors, 10n, (BigInt(exponent) - BigInt(digits.length - 1)) * power);
}

function gcd(a: bigint, b: bigint): bigint
{
	while (b)
	{
		[a, b] = [b, a % b];
	}

	return a;
}

/** Cancel exact integer factors without ever expanding large unit powers. */
function reduce(factors: Factors): Factors
{
	for (;;)
	{
		let changed = false;
		outer: for (const [a, pa] of factors) {
			if (pa < 0n) continue;

			for (const [b, pb] of factors)
			{
				if (pb > 0n) continue;
				const common = gcd(a, b);

				if (common === 1n) continue;

				factors.delete(a); factors.delete(b);
				addFactor(factors, a / common, pa);
				addFactor(factors, b / common, pb);
				addFactor(factors, common, pa + pb);
				changed = true;
				break outer;
			}
		}

		if (!changed)
		{
			return factors;
		}
	}
}

function unitFactors(units: UnitStructure): ReadonlyMap<bigint, bigint>
{
	const key = unitKey(units);
	let plan = plans.get(key);

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

	plan = reduce(factors);
	plans.set(key, plan);

	return plan;
}

function appendUnits(factors: Factors, units: UnitStructure, sign: bigint): void
{
	for (const [factor, count] of unitFactors(units))
	{
		addFactor(factors, factor, count * sign);
	}
}

/** Prepare a finite value or reciprocal in target units, without rounding or range checks. */
export function unitValue(value: QuantityDefinition, target?: UnitStructure, reciprocal = false): RationalValue
{
	const term = decimalTerm(value.scalar);

	if (!term.numerator)
	{
		if (reciprocal)
		{
			throw new Error('Divide by zero');
		}

		return { exact: term };
	}

	const factors: Factors = new Map();
	appendUnits(factors, value, reciprocal ? -1n : 1n);

	if (target)
	{
		appendUnits(factors, target, -1n);
	}

	reduce(factors);
	const exponent = factors.get(10n) ?? 0n;
	factors.delete(10n);
	const exact = smallRatio(factors);

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
	// Build and reduce the plan once; precision refinement reuses it.
	addFactor(factors, 10n, exponent);
	accumulate(factors, value.scalar, reciprocal ? -1n : 1n);
	return factoredValue(factors, value.scalar.isNeg());
}

/** Directed enclosures keep scientific exponents outside Decimal's range. */
function factorBounds(factors: Factors, negative: boolean, exponent: bigint, precision: number): [RationalTerm, RationalTerm]
{
	const Lower = Exact.clone({ precision, rounding: 'down' });
	const Upper = Exact.clone({ precision, rounding: 'up' });
	const nl = side(factors, true, Lower), nh = side(factors, true, Upper);
	const dl = side(factors, false, Lower), dh = side(factors, false, Upper);
	const bound = (a: ScaledValue, b: ScaledValue) => {
		const term = decimalTerm(a.coefficient.div(b.coefficient));

		return {
			...term,
			exponent: term.exponent + a.exponent - b.exponent + exponent
		};
	};
	const low = bound(nl, dh), high = bound(nh, dl);

	return negative ? [scaleTerm(high, -1n), scaleTerm(low, -1n)] : [low, high];
}

function factoredValue(factors: Factors, negative: boolean): RationalValue
{
	reduce(factors);
	const exponent = factors.get(10n) ?? 0n;
	factors.delete(10n);
	const exact = smallRatio(factors);

	return exact ? { exact: { numerator: negative ? -exact[0] : exact[0], denominator: exact[1], exponent } }
		: { bounds: precision => factorBounds(factors, negative, exponent, precision) };
}

function normalize(value: Decimal, exponent: bigint, Numeric: DecimalConstructor): ScaledValue
{
	const [coefficient, offset] = value.toExponential().split('e');

	return {
		coefficient: new Numeric(coefficient),
		exponent: exponent + BigInt(offset)
	};
}

function multiply(a: ScaledValue, b: ScaledValue, Numeric: DecimalConstructor): ScaledValue
{
	return normalize(a.coefficient.mul(b.coefficient), a.exponent + b.exponent, Numeric);
}

function power(value: bigint, count: bigint, Numeric: DecimalConstructor): ScaledValue
{
	let factor = normalize(new Numeric(value), 0n, Numeric);
	let result: ScaledValue = { coefficient: new Numeric(1), exponent: 0n };

	while (count)
	{
		if (count & 1n)
		{
			result = multiply(result, factor, Numeric);
		}

		count >>= 1n;

		if (count)
		{
			factor = multiply(factor, factor, Numeric);
		}
	}

	return result;
}

function side(factors: Factors, positive: boolean, Numeric: DecimalConstructor): ScaledValue
{
	let result: ScaledValue = { coefficient: new Numeric(1), exponent: 0n };

	for (const [factor, count] of factors)
	{
		if ((count > 0n) === positive)
		{
			result = multiply(result, power(factor, count > 0n ? count : -count, Numeric), Numeric);
		}
	}

	return result;
}

/** Small exact products avoid intermediate rounding, including decimal ties. */
function smallRatio(factors: Factors): [bigint, bigint] | undefined
{
	let digits = 0n;

	for (const [factor, count] of factors)
	{
		digits += BigInt(factor.toString().length) * (count < 0n ? -count : count);

		if (digits > 4096n)
		{
			return undefined;
		}
	}

	let numerator = 1n, denominator = 1n;

	for (const [factor, count] of factors)
	{
		if (count > 0n)
		{
			numerator *= factor ** count;
		}
		else
		{
			denominator *= factor ** -count;
		}
	}

	return [numerator, denominator];
}

function finish(factors: Factors, negative: boolean, Output: DecimalConstructor): Decimal
{
	return evaluateRational([factoredValue(factors, negative)], terms => roundSum(terms, Output));
}

// Reuse exact terminating factors (feet, pounds, ounces, metric prefixes). Multiplying
// once in the output context is correctly rounded and avoids rebuilding rational plans.
function exactBaseFactor(units: UnitStructure, Output: DecimalConstructor): Decimal | null
{
	let cache = exactBaseFactors.get(Output.config);

	if (!cache)
	{
		exactBaseFactors.set(Output.config, cache = new LruCache());
	}

	const key = unitKey(units), cached = cache.get(key);

	if (cached !== undefined)
	{
		return cached;
	}

	const factors = new Map(unitFactors(units));
	const exponent = factors.get(10n) ?? 0n;
	factors.delete(10n);
	const exact = smallRatio(factors);
	let result: Decimal | null = null;

	if (exact)
	{
		let denominator = exact[1], twos = 0n, fives = 0n;
		while (denominator % 2n === 0n)
		{
			denominator /= 2n; twos++;
		}

		while (denominator % 5n === 0n)
		{
			denominator /= 5n; fives++;
		}

		if (denominator === 1n)
		{
			const places = twos > fives ? twos : fives;
			const coefficient = exact[0] * 2n ** (places - twos) * 5n ** (places - fives);
			const value = new Output(`${coefficient}e${exponent - places}`);

			if (value.isFinite() && !value.isZero())
			{
				result = value;
			}
		}
	}

	cache.set(key, result);
	return result;
}

export function resolveUnitValue(value: QuantityDefinition, target?: UnitStructure, Output: DecimalConstructor = Decimal): Decimal
{
	if (value.scalar.isZero() || !value.scalar.isFinite())
	{
		return new Output(value.scalar);
	}

	if (!target)
	{
		const factor = exactBaseFactor(value, Output);

		if (factor)
		{
			const scalar = value.scalar.constructor === Output ? value.scalar : new Output(value.scalar);

			if (scalar.eq(value.scalar))
			{
				return scalar.mul(factor);
			}
		}
	}

	return evaluateRational([unitValue(value, target)], terms => roundSum(terms, Output));
}

/** Evaluate both scalar operands and all unit factors before rounding or range checks. */
export function resolveProduct(a: QuantityDefinition, b: QuantityDefinition, target: UnitStructure,
	divide: boolean, Output: DecimalConstructor = Decimal): Decimal
{
	if (!a.scalar.isFinite() || !b.scalar.isFinite() || a.scalar.isZero() || b.scalar.isZero())
	{
		return calculateScalar(a.scalar, divide ? 'div' : 'mul', b.scalar, Output);
	}

	const factors = new Map(unitFactors(a));
	appendUnits(factors, b, divide ? -1n : 1n);
	appendUnits(factors, target, -1n);
	accumulate(factors, a.scalar, 1n);
	accumulate(factors, b.scalar, divide ? -1n : 1n);

	return finish(factors, a.scalar.isNeg() !== b.scalar.isNeg(), Output);
}

export function resolveReciprocal(value: QuantityDefinition, target: UnitStructure, Output: DecimalConstructor): Decimal
{
	if (value.scalar.isZero())
	{
		throw new Error('Divide by zero');
	}

	if (!value.scalar.isFinite())
	{
		return new Output(1).div(value.scalar);
	}

	return evaluateRational([unitValue(value, target, true)], terms => roundSum(terms, Output));
}

/** Exact cancellation plus directed bounds makes comparison independent of user precision. */
export function compareUnitValues(a: QuantityDefinition, b: QuantityDefinition): number
{
	if (a.scalar.isNaN() || b.scalar.isNaN())
	{
		return NaN;
	}

	if (
		!a.scalar.isFinite() || !b.scalar.isFinite()
		|| a.scalar.isZero() || b.scalar.isZero()
		|| a.scalar.isNeg() !== b.scalar.isNeg()
	){
		return a.scalar.cmp(b.scalar);
	}

	const factors = new Map(unitFactors(a));
	appendUnits(factors, b, -1n);
	accumulate(factors, a.scalar, 1n); accumulate(factors, b.scalar, -1n);
	const comparison = evaluateRational([factoredValue(factors, false)], ([term]) =>
		compareSum([term, { numerator: -1n, denominator: 1n, exponent: 0n }]));

	return a.scalar.isNeg() ? -comparison : comparison;
}

/** Cancel and round the complete sum once, preserving arbitrarily distant signed tails. */
export function resolveSum(a: QuantityDefinition, b: QuantityDefinition, target: UnitStructure,
	subtract: boolean, Output: DecimalConstructor = Decimal): Decimal
{
	if (!a.scalar.isFinite() || !b.scalar.isFinite() || a.scalar.isZero() && b.scalar.isZero())
	{
		return calculateScalar(a.scalar, subtract ? 'sub' : 'add', b.scalar, Output);
	}

	const left = unitValue(a, target), right = unitValue(b, target);
	// Equal large factored values must cancel symbolically: independent enclosures
	// would straddle zero at every precision. Ordinary exact sums skip this work.
	if ((!('exact' in left) || !('exact' in right)) && a.scalar.isNeg() !== (b.scalar.isNeg() !== subtract))
	{
		const magnitude = { numerator: b.numerator, denominator: b.denominator, scalar: a.scalar.isNeg() === b.scalar.isNeg() ? b.scalar : new Exact(b.scalar).neg() };
		if (compareUnitValues(a, magnitude) === 0)
		{
			return new Output(1).sub(1);
		}
	}

	return evaluateRational([left, subtract ? negateValue(right) : right], terms => roundSum(terms, Output));
}
