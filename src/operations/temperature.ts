import type { RationalTerm, RationalValue } from '@neutrium/utilities/numeric/factors';
import { CacheScope } from '../utils/CacheScope.js';
import type { ArithmeticAdapter } from '@neutrium/utilities/numeric/arithmetic';
import type { Quantity } from '../QuantityCore.js';
import type { UnitStructure } from '../QuantityDefinition.js';
import { TEMPERATURE_SIGNATURE } from './unit-signatures.js';
import { normalizePowers, UNITY } from './unit-powers.js';
import { scale, unitValue } from './unit-scale.js';
import { scalarTerm } from './exact-sum.js';
import { parseRationalTerm, scaleTerm, negateValue, evaluateRational, hasRationalArithmetic, type RationalArithmeticAdapter } from '@neutrium/utilities/numeric/rational';

/** Fixed catalog structures contain no scalar, adapter or cache state. */
function temperatureUnits(unit: string): UnitStructure
{
	return Object.freeze({ numerator: normalizePowers([{ unit, exponent: 1 }]), denominator: UNITY });
}

/** Shared absolute-kelvin result units, including when optional caches are disabled. */
export const ABSOLUTE_KELVIN_UNITS = temperatureUnits('<temp-K>');

// Kelvin = (reading + offset) * numerator / denominator; final entry is the interval structure.
const temperatures: Record<string, readonly [bigint, bigint, string, UnitStructure]> = {
	'<temp-K>': [1n, 1n, '0', temperatureUnits('<kelvin>')],
	'<temp-C>': [1n, 1n, '273.15', temperatureUnits('<celsius>')],
	'<temp-F>': [5n, 9n, '459.67', temperatureUnits('<fahrenheit>')],
	'<temp-R>': [5n, 9n, '0', temperatureUnits('<rankine>')],
};

export function isDegrees(a: UnitStructure & { readonly signature?: string }): boolean
{
	return (a.signature === undefined || a.signature === TEMPERATURE_SIGNATURE) &&
		a.numerator.length === 1 && a.denominator.length === 0 &&
		a.numerator[0].exponent === 1 && !a.numerator[0].prefix &&
		/^(<temp-[CFRK]>|<(kelvin|celsius|rankine|fahrenheit)>)$/.test(a.numerator[0].unit);
}

export function isTemperature(a: UnitStructure & { readonly signature?: string }): boolean
{
	return isDegrees(a) && a.numerator[0].unit.startsWith('<temp-');
}

interface TemperatureConstants<T>
{
	readonly boundary: T;
	term?: RationalTerm;
	/** Offset already expressed in kelvin. */
	offset?: RationalTerm;
	toKelvin?: T;
	fromKelvin?: T;
}

// The adapter instance identifies an immutable configuration. Weak keys release
// discarded contexts; each live adapter retains at most the four absolute scales.
const constantsKey = Symbol();

function temperatureConstants<T>(unit: string, numeric: ArithmeticAdapter<T>, scope: CacheScope): TemperatureConstants<T>
{
	const constants = scope.get('temperatureConstants', constantsKey, () => new WeakMap<object, Map<string, TemperatureConstants<unknown>>>());
	let scales = constants?.get(numeric);

	if (!scales && constants)
	{
		constants.set(numeric, scales = new Map());
	}

	let value = scales?.get(unit) as TemperatureConstants<T> | undefined;

	if (!value)
	{
		const offset = temperatures[unit][2];
		// Construct the literal: negation itself can round with some backends.
		value = { boundary: numeric.from(offset === '0' ? '0' : '-' + offset) };
		scales?.set(unit, value);
	}

	return value;
}

function boundary<T>(unit: string, numeric: ArithmeticAdapter<T>, scope: CacheScope): T
{
	return temperatureConstants(unit, numeric, scope).boundary;
}

/** Inputs use the same absolute scale; matching boundaries cancel without arithmetic. */
function sameTemperatureBoundary<T>(a: Quantity<T>, b: Quantity<T>, scope: CacheScope): boolean
{
	return sameBoundary(a.numerator[0].unit, b.numeric, a.numeric, scope);
}

function sameBoundary<T>(unit: string, source: ArithmeticAdapter<T>, receiver: ArithmeticAdapter<T>, scope: CacheScope): boolean
{
	return source === receiver || receiver.compare(boundary(unit, source, scope), boundary(unit, receiver, scope)) === 0;
}

/** Keep each input's represented boundary, evaluating only their difference in the receiver. */
function boundaryDifference<T>(a: Quantity<T>, b: Quantity<T>, scope: CacheScope): T
{
	return a.numeric.sub(boundary(a.numerator[0].unit, a.numeric, scope), boundary(b.numerator[0].unit, b.numeric, scope));
}

/** Preserve native boundary quantization, but never turn a catalog offset into infinity. */
function boundaryTerm<T>(unit: string, numeric: RationalArithmeticAdapter<T>, scope: CacheScope, source: ArithmeticAdapter<T> = numeric): RationalTerm
{
	const cached = temperatureConstants(unit, source, scope);

	return cached.term ??= source.isFinite(cached.boundary) ? scalarTerm(cached.boundary, numeric, scope)
		: parseRationalTerm('-' + temperatures[unit][2]);
}

function rejectBelowZero(): never
{
	throw new Error('Temperatures must not be less than absolute zero');
}

/** Construction checks represented inputs; only valid calculated results may be clamped. */
export function isBelowAbsoluteZero<T>(a: Quantity<T>): boolean
{
	const n = a.numeric, unit = a.numerator[0].unit, scope = a.cacheScope;
	const minimum = boundary(unit, n, scope);

	if (n.isFinite(minimum))
	{
		return n.compare(a.scalar, minimum) < 0;
	}

	// A negative-infinite reading is never absolute zero, even when the
	// configured range also overflows the boundary to negative infinity.
	if (!n.isFinite(a.scalar))
	{
		return n.compare(a.scalar, n.from(0)) < 0;
	}

	if (hasRationalArithmetic(n))
	{
		return n.compareRationalSum([
			scalarTerm(a.scalar, n, scope), scaleTerm(boundaryTerm(unit, n, scope), -1n),
		]) < 0;
	}

	return n.compare(a.scalar, minimum) < 0;
}

/** Check only the completed result, never an intermediate rational bound. */
function checkTemperatureRange<T>(value: T, numeric: ArithmeticAdapter<T>): T
{
	if (!numeric.isFinite(value) && numeric.compare(value, numeric.from(0)) < 0)
	{
		throw new RangeError('Absolute temperature is outside the numeric backend range');
	}

	return value;
}

/** A valid zero-kelvin result still needs a finite reading in the target scale. */
function absoluteZero<T>(unit: string, numeric: ArithmeticAdapter<T>, scope: CacheScope): T
{
	return checkTemperatureRange(boundary(unit, numeric, scope), numeric);
}

/** Clamp a validated result if output rounding pushes it below its represented boundary. */
function clamp<T>(value: T, unit: string, numeric: ArithmeticAdapter<T>, scope: CacheScope): T
{
	const minimum = boundary(unit, numeric, scope);
	const comparison = numeric.compare(value, minimum);
	return comparison < 0 ? minimum : value;
}

function temperatureFactor<T>(unit: string, n: ArithmeticAdapter<T>, scope: CacheScope, inverse = false): T
{
	const constants = temperatureConstants(unit, n, scope);
	const [num, den] = temperatures[unit];

	return inverse ? constants.fromKelvin ??= n.div(n.from(den), n.from(num))
		: constants.toKelvin ??= n.div(n.from(num), n.from(den));
}

/** Native/custom arithmetic retains the adapter's own intermediate rounding and range. */
function adapterPhysical<T>(a: Quantity<T>, n: ArithmeticAdapter<T>, scope: CacheScope): T
{
	if (!a.isTemperature())
	{
		return scale(a.scalar, a, undefined, n, false, scope);
	}

	const unit = a.numerator[0].unit;

	return n.mul(n.sub(a.scalar, boundary(unit, a.numeric, scope)), temperatureFactor(unit, n, scope));
}

/** Evaluate an absolute temperature in physical kelvin using its own backend. */
export function temperatureBaseScalar<T>(a: Quantity<T>): T
{
	const numeric = a.numeric, scope = a.cacheScope;

	if (!numeric.isFinite(a.scalar))
	{
		return a.scalar;
	}

	if (!hasRationalArithmetic(numeric))
	{
		return adapterPhysical(a, numeric, scope);
	}

	return evaluateRational(
		physicalTerms(a, numeric, scope),
		terms => numeric.fromRationalSum(terms),
		{ equal: (a, b) => numeric.compare(a, b) === 0 }
	);
}

export function temperatureTargetScalar<T>(source: Quantity<T>, target: Quantity<unknown>, reciprocal: boolean): T
{
	const scope = source.cacheScope;
	const n = source.numeric, unit = target.numerator[0].unit;

	if (!n.isFinite(source.scalar))
	{
		if (n.compare(source.scalar, n.from(0)) < 0)
		{
			rejectBelowZero();
		}

		if (reciprocal && n.compare(source.scalar, n.from(0)) > 0)
		{
			return absoluteZero(unit, n, scope);
		}

		return source.scalar;
	}

	if (!hasRationalArithmetic(n))
	{
		const zero = n.from(0);
		// All catalog scales are positive: reject negative intervals before underflow.
		if (!source.isTemperature() && n.compare(source.scalar, zero) < 0)
		{
			rejectBelowZero();
		}

		const kelvin = reciprocal ? scale(source.scalar, source, undefined, n, true, scope)
			: adapterPhysical(source, n, scope);
		const sign = n.compare(kelvin, zero);

		if (sign < 0)
		{
			rejectBelowZero();
		}

		if (sign === 0)
		{
			return absoluteZero(unit, n, scope);
		}

		return checkTemperatureRange(clamp(n.add(n.mul(kelvin, temperatureFactor(unit, n, scope, true)), boundary(unit, n, scope)), unit, n, scope), n);
	}
	const values = reciprocal ? [unitValue(source, undefined, n, true, scope)] : physicalTerms(source, n, scope);
	const sign = evaluateRational(values, terms => n.compareRationalSum(terms));

	if (sign < 0)
	{
		rejectBelowZero();
	}
	else if (sign === 0)
	{
		return absoluteZero(unit, n, scope);
	}

	const [num, den] = temperatures[unit];
	const minimum = boundaryTerm(unit, n, scope);

	return checkTemperatureRange(evaluateRational(values, terms => clamp(n.fromRationalSum([
		...terms.map(term => scaleTerm(term, den, num)), minimum,
	]), unit, n, scope), { equal: (a, b) => n.compare(a, b) === 0 }), n);
}

function physicalTerms<T>(a: Quantity<T>, n: RationalArithmeticAdapter<T>, scope: CacheScope): RationalValue[]
{
	// The receiver extracts compatible scalars; each input retains its own represented boundary.
	if (!a.isTemperature())
	{
		return [unitValue(a, undefined, n, false, scope)];
	}

	const [num, den] = temperatures[a.numerator[0].unit];
	const scalar = scalarTerm(a.scalar, n, scope);
	const cached = temperatureConstants(a.numerator[0].unit, a.numeric, scope);
	const offset = cached.offset ??= scaleTerm(boundaryTerm(a.numerator[0].unit, n, scope, a.numeric), -num, den);

	return [{ exact: scaleTerm(scalar, num, den) }, { exact: offset }];
}

/** Compare absolute values with offsets and intervals without offsets, using the receiver's adapter. */
export function compareTemperatures<T>(a: Quantity<T>, b: Quantity<T>): number
{
	const scope = a.cacheScope;
	const n = a.numeric;

	if (!n.isFinite(a.scalar) || !n.isFinite(b.scalar))
	{
		return n.compare(a.scalar, b.scalar);
	}

	const sameScale = a.isTemperature() && b.isTemperature() && a.numerator[0].unit === b.numerator[0].unit;

	if (sameScale && sameTemperatureBoundary(a, b, scope))
	{
		return n.compare(a.scalar, b.scalar);
	}

	// On one scale the positive Kelvin factor cancels. Compare differences to
	// avoid adding a large common offset that can hide distinct native readings.
	if (!hasRationalArithmetic(n))
	{
		return sameScale
			? n.compare(n.sub(a.scalar, b.scalar), boundaryDifference(a, b, scope))
			: n.compare(adapterPhysical(a, n, scope), adapterPhysical(b, n, scope));
	}
	const values = [...physicalTerms(a, n, scope), ...physicalTerms(b, n, scope).map(negateValue)];

	return evaluateRational(values, terms => n.compareRationalSum(terms));
}

export function subtractTemperatures<T, C extends object>(a: Quantity<T, C>, b: Quantity<T>): Quantity<T, C>
{
	const scope = a.cacheScope;
	const n = a.numeric;
	const [num, den, , units] = temperatures[a.numerator[0].unit];

	if (!hasRationalArithmetic(n))
	{
		let scalar: T;

		if (a.numerator[0].unit === b.numerator[0].unit)
		{
			scalar = n.sub(a.scalar, b.scalar);
			if (!sameTemperatureBoundary(a, b, scope) && n.isFinite(a.scalar) && n.isFinite(b.scalar))
			{
				scalar = n.sub(scalar, boundaryDifference(a, b, scope));
			}
		}
		else
		{
			scalar = n.mul(n.sub(adapterPhysical(a, n, scope), adapterPhysical(b, n, scope)),
				temperatureFactor(a.numerator[0].unit, n, scope, true));
		}

		return a.createResult(scalar, units);
	}

	if (!n.isFinite(a.scalar) || !n.isFinite(b.scalar))
	{
		return a.createResult(n.sub(a.scalar, b.scalar), units);
	}

	if (n === b.numeric && a.numerator[0].unit === b.numerator[0].unit)
	{
		// Identical contexts and scales have the same represented boundary and factor.
		// Cancel those symbolically, then round the difference of the readings once.
		const left = scalarTerm(a.scalar, n, scope), right = scalarTerm(b.scalar, n, scope);

		// Two zero readings still need offset cancellation to preserve the adapter's zero sign.
		if (left.numerator !== 0n || right.numerator !== 0n)
		{
			return a.createResult(n.fromRationalSum([left, scaleTerm(right, -1n)]), units);
		}
	}

	const scalar = evaluateRational([...physicalTerms(a, n, scope), ...physicalTerms(b, n, scope).map(negateValue)],
		terms => n.fromRationalSum(terms.map(term => scaleTerm(term, den, num))),
		{ equal: (a, b) => n.compare(a, b) === 0 });

	return a.createResult(scalar, units);
}

/** Validate in the source scale, then round the reading in the receiver's scale once. */
function checkedReading<T>(values: RationalValue[], temp: Quantity<T>, n: RationalArithmeticAdapter<T>, scope: CacheScope): T
{
	const unit = temp.numerator[0].unit;
	const minimum = boundaryTerm(unit, n, scope, temp.numeric);
	// Validate the complete expression, not individual enclosure endpoints.
	const sign = evaluateRational(values, terms => n.compareRationalSum([...terms, scaleTerm(minimum, -1n)]));

	if (sign < 0)
	{
		rejectBelowZero();
	}

	if (sign === 0)
	{
		return absoluteZero(unit, n, scope);
	}

	const adjustment = sameBoundary(unit, temp.numeric, n, scope) ? undefined
		: [scaleTerm(minimum, -1n), boundaryTerm(unit, n, scope)];

	return checkTemperatureRange(evaluateRational(values,
		terms => clamp(n.fromRationalSum(adjustment ? [...terms, ...adjustment] : terms), unit, n, scope),
		{ equal: (a, b) => n.compare(a, b) === 0 }), n);
}

/** Finish a represented interval above absolute zero without changing backend arithmetic. */
function readingAboveZero<T>(distance: T, unit: string, n: ArithmeticAdapter<T>, scope: CacheScope): T
{
	const sign = n.compare(distance, n.from(0));

	if (sign < 0)
	{
		rejectBelowZero();
	}

	if (sign === 0)
	{
		return absoluteZero(unit, n, scope);
	}

	return checkTemperatureRange(clamp(n.add(distance, boundary(unit, n, scope)), unit, n, scope), n);
}

/** Shift an absolute reading by an interval without rounding the validation operands. */
export function changeTemperature<T, C extends object>(temp: Quantity<T>, interval: Quantity<T>, subtract: boolean, owner: Quantity<T, C>): Quantity<T, C>
{
	const scope = owner.cacheScope;
	const n = owner.numeric, unit = temp.numerator[0].unit;

	if (!hasRationalArithmetic(n) || !n.isFinite(temp.scalar) || !n.isFinite(interval.scalar))
	{
		const direction = n.compare(interval.scalar, n.from(0)) * (subtract ? -1 : 1);
		const minimum = boundary(unit, temp.numeric, scope);

		if (direction < 0 && n.compare(temp.scalar, minimum) === 0)
		{
			rejectBelowZero();
		}

		const delta = scale(interval.scalar, interval, temp, n, false, scope);

		if (!sameBoundary(unit, temp.numeric, n, scope) && n.isFinite(temp.scalar) && n.isFinite(interval.scalar))
		{
			// A source boundary represents zero even if the receiver rounds it differently.
			const distance = n.sub(temp.scalar, minimum);

			return owner.createResult(readingAboveZero(subtract ? n.sub(distance, delta) : n.add(distance, delta), unit, n, scope), temp);
		}

		return owner.createResult(subtract ? n.sub(temp.scalar, delta) : n.add(temp.scalar, delta), temp);
	}

	const delta = unitValue(interval, temp, n, false, scope);
	const values: RationalValue[] = [{ exact: scalarTerm(temp.scalar, n, scope) }, subtract ? negateValue(delta) : delta];

	return owner.createResult(checkedReading(values, temp, n, scope), temp);
}

/** Scalar multiplication/division uses the same physical-boundary rules as addition. */
export function scaleTemperature<T, C extends object>(temp: Quantity<T>, factor: T, divide: boolean, owner: Quantity<T, C>): Quantity<T, C>
{
	const scope = owner.cacheScope;
	const n = owner.numeric;
	const rational = hasRationalArithmetic(n);
	let scalar: T;

	if (!rational)
	{
		const zero = n.from(0);
		if (n.compare(boundary(temp.numerator[0].unit, n, scope), zero) === 0 &&
			n.compare(temp.scalar, zero) * n.compare(factor, zero) < 0)
		{
			rejectBelowZero();
		}
	}

	if (!rational || !n.isFinite(temp.scalar) || !n.isFinite(factor) || divide && n.compare(factor, n.from(0)) === 0)
	{
		scalar = divide ? n.div(temp.scalar, factor) : n.mul(temp.scalar, factor);
		const unit = temp.numerator[0].unit;

		if (!sameBoundary(unit, temp.numeric, n, scope) && n.isFinite(scalar))
		{
			if (rational)
			{
				scalar = checkedReading([{ exact: scalarTerm(scalar, n, scope) }], temp, n, scope);
			}
			else
			{
				const minimum = boundary(unit, temp.numeric, scope);
				// Compare represented readings before subtracting: that difference may underflow.
				if (n.compare(scalar, minimum) < 0)
				{
					rejectBelowZero();
				}

				scalar = readingAboveZero(n.sub(scalar, minimum), unit, n, scope);
			}
		}
	}
	else
	{
		const a = scalarTerm(temp.scalar, n, scope), b = scalarTerm(factor, n, scope);
		const term = divide ? scaleTerm({ ...a, exponent: a.exponent - b.exponent }, b.denominator, b.numerator)
			: scaleTerm({ ...a, exponent: a.exponent + b.exponent }, b.numerator, b.denominator);
		scalar = checkedReading([{ exact: term }], temp, n, scope);
	}

	return owner.createResult(scalar, temp);
}

/** Absolute values can be shifted by intervals; two absolute values can only be subtracted. */
export function validateTemperatureSum(aTemperature: boolean, bTemperature: boolean, subtract: boolean): void
{
	if (bTemperature)
	{
		if (!subtract && aTemperature)
		{
			throw new Error('Cannot add two temperatures');
		}

		if (subtract && !aTemperature)
		{
			throw new Error('Cannot subtract a temperature from a differential degree unit');
		}
	}
}
