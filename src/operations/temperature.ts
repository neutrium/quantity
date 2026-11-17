import type { RationalTerm, RationalValue } from '@neutrium/math/numeric/factors';
import { fractionFromTerm, addFractions } from '@neutrium/math/numeric/fractions';
import { CacheScope } from '../utils/CacheScope.js';
import type { ArithmeticAdapter } from '@neutrium/math/numeric/arithmetic';
import type { Quantity } from '../QuantityCore.js';
import { integerAsNumber, scalarSign } from '../numeric/support.js';
import { isTemperature, temperatureChecks, type ParsedTemperatureChecks } from './temperature-units.js';
import type { UnitStructure } from '../QuantityDefinition.js';
import { baseUnitValue, sameUnitScale, scale, scaledTerm } from './unit-scale.js';
import { canCompareRationalTerms, canSumRationalTerms, evaluateRoundedScalar, scalarTerm } from './rational-terms.js';
import { scaleTerm, negateValue, evaluateRational, rationalToScalar, hasRationalComparison, hasRationalConstruction, hasRationalExtraction, type RationalConstruction } from '@neutrium/math/numeric/rational';
import { boundaryAdjustment, boundaryTerm, hasZeroTemperatureOffset, makeResult, representedTerm,
	kelvinOffsetTerm, scaleReading, temperatureConstants, temperatureLiteral, type TemperatureConstants, temperatures } from './temperature-boundary.js';

/** Adopt a temperature reading without inferring its representation from unrelated scalars. */
function adoptReading<T, S>(value: S, source: ArithmeticAdapter<S>, receiver: ArithmeticAdapter<T>, scope: CacheScope): T
{
	if (typeof value === 'number' || receiver.isValue(value))
	{
		return receiver.from(value);
	}

	if (!source.isFinite(value))
	{
		return receiver.from(source.toNumber(value));
	}

	if (!hasRationalExtraction(source))
	{
		let literal;
		try
		{
			literal = temperatureLiteral(value, source);
		}
		catch (error)
		{
			// Formatting can be unavailable. A native receiver can still adopt the owner's double.
			const native = source.toNumber(value);

			if (!receiver.isValue(native) || !Number.isFinite(native) || (native === 0 && !source.isInteger(value)) ||
				source.compare(source.from(native), value) !== 0)
			{
				throw error;
			}

			literal = native;
		}
		return receiver.from(literal);
	}

	const term = scalarTerm(value, source, scope);

	if (!term.numerator)
	{
		return receiver.from(source.toNumber(value));
	}

	if (hasRationalConstruction(receiver))
	{
		return receiver.fromRationalSum([term]);
	}

	if (term.denominator === 1n)
	{
		return receiver.from(`${term.numerator}e${term.exponent}`);
	}

	return rationalToScalar(receiver, { exact: term });
}

/** Copy a point on the same scale, translating the represented zero between adapters. */
export function copyTemperatureReading<T, S>(temp: UnitStructure & { numeric: ArithmeticAdapter<S>; scalar: S },
	n: ArithmeticAdapter<T>, scope: CacheScope, destination: TemperatureConstants<T>, origin?: TemperatureConstants<S>): T
{
	return mapTemperatureReading(temp, n, scope, destination, origin,
		reading => adoptReading(reading, temp.numeric, n, scope));
}

/** Absolute zero maps to the destination boundary. Other readings retain their original scalar until a boundary shift is needed. */
function mapTemperatureReading<S, T>(temp: UnitStructure & { numeric: ArithmeticAdapter<S>; scalar: S },
	n: ArithmeticAdapter<T>, scope: CacheScope, destination: TemperatureConstants<T>, origin: TemperatureConstants<S> | undefined,
	fromSource: (reading: S) => T, operation?: (reading: T) => T): T
{
	const source = temp.numeric, reading = temp.scalar, unit = temp.numerator[0].unit;

	if (hasZeroTemperatureOffset(temp) || !source.isFinite(reading))
	{
		return fromSource(reading);
	}

	origin ??= temperatureConstants(unit, source, scope);
	const sourceMinimum = origin.boundary;
	const minimum = destination.boundary;

	if (source.compare(reading, sourceMinimum) === 0)
	{
		checkTemperatureRange(minimum, n);
		// A neutral operation must keep the physical endpoint. At a displayed zero
		// the adapter still decides its sign from the operands.
		if (!operation || integerAsNumber(n, minimum) !== 0)
		{
			return minimum;
		}

		return integerAsNumber(source, reading) === 0 ? fromSource(reading) : operation(minimum);
	}
	// Use native arithmetic only on values the receiver actually recognizes.
	if (!hasRationalConstruction(n) && n.isValue(sourceMinimum) &&
		source.isFinite(sourceMinimum) && n.isFinite(minimum))
	{
		if (n.compare(sourceMinimum, minimum) === 0)
		{
			return fromSource(reading);
		}

		if (n.isValue(reading))
		{
			const translated = translateAboveZero(reading, sourceMinimum, minimum, n);
			return operation ? operation(translated) : translated;
		}
	}

	const adjustment = boundaryAdjustment(source, n, scope, origin, destination);

	if (adjustment === null)
	{
		return fromSource(reading);
	}

	let value: T;

	if (hasRationalConstruction(n))
	{
		value = n.fromRationalSum([representedTerm(reading, source, n, scope), ...adjustment]);
	}
	else
	{
		const scalar = n.isValue(reading) ? reading : adoptReading(reading, source, n, scope);
		value = n.add(scalar, offsetScalar(adjustment, n));
	}

	const translated = clamp(checkTemperatureRange(value, n), minimum, n);

	return operation ? operation(translated) : translated;
}

/** A zero shift or unit multiplier preserves the physical reading, with final rounding and signed zero from the receiver. */
function applyTemperatureIdentity<T>(temp: Quantity<T>, n: ArithmeticAdapter<T>, scope: CacheScope,
	destination: TemperatureConstants<T>, origin: TemperatureConstants<T> | undefined, operation: (reading: T) => T): T
{
	const result = mapTemperatureReading(temp, n, scope, destination, origin, operation, operation);

	return clamp(checkTemperatureRange(result, n), destination.boundary, n);
}

/** Standalone catalog intervals have only two sizes: kelvin/Celsius and rankine/Fahrenheit. */
function matchingInterval(absolute: UnitStructure, interval: UnitStructure): boolean | undefined
{
	if (interval.numerator.length !== 1 || interval.denominator.length)
	{
		return undefined;
	}

	const term = interval.numerator[0];

	if (term.prefix || term.exponent !== 1)
	{
		return undefined;
	}

	switch (term.unit)
	{
		case '<kelvin>': case '<celsius>': return temperatures[absolute.numerator[0].unit][0] === 1n;
		case '<rankine>': case '<fahrenheit>': return temperatures[absolute.numerator[0].unit][0] === 5n;
		default: return undefined;
	}
}

function sameAbsoluteAndIntervalScale(absolute: UnitStructure, interval: UnitStructure, scope: CacheScope): boolean
{
	return hasZeroTemperatureOffset(absolute) && (matchingInterval(absolute, interval) ?? sameUnitScale(absolute, interval, scope));
}

// Parsers defer physical errors until construction while preserving scalar diagnostics.
export class BelowAbsoluteZeroError extends Error {}
export class TemperatureRangeError extends RangeError {}

function rejectBelowZero(): never
{
	throw new BelowAbsoluteZeroError('Temperatures must not be less than absolute zero');
}

/** Construction checks represented inputs; only valid calculated results may be clamped. */
export function validateParsedTemperatures<T>(definition: UnitStructure & ParsedTemperatureChecks<T>, numeric: ArithmeticAdapter<T>, scope: CacheScope): void
{
	const checks = definition[temperatureChecks];

	if (typeof checks === 'string')
	{
		throw new Error(checks);
	}

	if (checks instanceof Error)
	{
		throw checks;
	}

	if (checks)
	{
		for (const { unit, scalar } of checks)
		{
			validateTemperatureReading(unit, scalar, numeric, scope);
		}
	}
}

export function validateTemperatureReading<T>(unit: string, scalar: T, n: ArithmeticAdapter<T>, scope: CacheScope,
	constants = temperatureConstants(unit, n, scope)): void
{
	const minimum = constants.boundary;

	if (!n.isFinite(minimum) && n.isFinite(scalar) && canCompareRationalTerms(n))
	{
		if (n.compareRationalSum([scalarTerm(scalar, n, scope), scaleTerm(boundaryTerm(constants, n, n, scope), -1n)]) < 0)
		{
			rejectBelowZero();
		}
	}
	else if (n.compare(scalar, minimum) < 0 || !n.isFinite(scalar) && scalarSign(n, scalar) < 0)
	{
		rejectBelowZero();
	}
}

/** Check only the completed result, never an intermediate rational bound. */
function checkTemperatureRange<T>(value: T, numeric: ArithmeticAdapter<T>): T
{
	if (!numeric.isFinite(value) && scalarSign(numeric, value) < 0)
	{
		throw new TemperatureRangeError('Absolute temperature is outside the numeric backend range');
	}

	return value;
}

/** Translate a valid reading by the difference of finite represented boundaries. */
function translateAboveZero<T>(value: T, from: T, to: T, n: ArithmeticAdapter<T>): T
{
	return clamp(checkTemperatureRange(n.add(value, n.sub(to, from)), n), to, n);
}

/** Clamp a validated result if output rounding pushes it below its represented boundary. */
function clamp<T>(value: T, minimum: T, numeric: ArithmeticAdapter<T>): T
{
	const comparison = numeric.compare(value, minimum);
	return comparison < 0 ? minimum : value;
}

/** Convert the difference of two catalog offsets using the receiver's arithmetic. */
function offsetScalar<T>(adjustment: readonly [RationalTerm, RationalTerm], n: ArithmeticAdapter<T>): T
{
	const [to, from] = adjustment;
	const difference = addFractions(fractionFromTerm(to), fractionFromTerm(from));
	const top = n.from(difference.numerator), bottom = n.from(difference.denominator);

	return n.isFinite(top) && n.isFinite(bottom) ? n.div(top, bottom)
		: rationalToScalar(n, { exact: { ...difference, exponent: 0n } });
}

function offsetChange<T>(origin: TemperatureConstants<T>, source: ArithmeticAdapter<T>, n: ArithmeticAdapter<T>,
	scope: CacheScope, destination: TemperatureConstants<T>): T | undefined
{
	const adjustment = boundaryAdjustment(source, n, scope, origin, destination);

	return adjustment ? offsetScalar(adjustment, n) : undefined;
}

/** Express the destination's displayed zero in source degrees, then scale the distance from it. */
function convertPointReading<T>(reading: T, source: ArithmeticAdapter<T>, n: ArithmeticAdapter<T>, scope: CacheScope,
	origin: TemperatureConstants<T>, destination: TemperatureConstants<T>): T
{
	const [sn, sd] = temperatures[origin.unit], [dn, dd] = temperatures[destination.unit];
	const anchor = offsetScalar([boundaryTerm(origin, source, n, scope),
		scaleTerm(boundaryTerm(destination, n, source, scope), -dn * sd, dd * sn)], n);
	const distance = n.sub(reading, anchor);

	return sn === dn ? distance : scaleReading(distance, sn === 1n ? destination.unit : origin.unit, n, scope, sn === 1n);
}

/** Native/custom arithmetic retains the adapter's own intermediate rounding and range. */
function adapterPhysical<T>(a: Quantity<T>, n: ArithmeticAdapter<T>, scope: CacheScope, constants?: TemperatureConstants<T>): T
{
	if (!isTemperature(a))
	{
		return scale(a.scalar, a, undefined, n, false, scope);
	}

	const unit = a.numerator[0].unit;
	constants ??= temperatureConstants(unit, a.numeric, scope);
	const distance = n.sub(a.scalar, constants.boundary);

	return scaleReading(distance, unit, n, scope, false, a.numeric === n ? constants : undefined);
}

/** Evaluate an absolute temperature in physical kelvin using its own backend. */
export function temperatureBaseScalar<T>(a: Quantity<T>): T
{
	const numeric = a.numeric, scope = a.cacheScope;

	if (!numeric.isFinite(a.scalar))
	{
		return a.scalar;
	}

	if (!canSumRationalTerms(numeric))
	{
		return adapterPhysical(a, numeric, scope);
	}

	return numeric.fromRationalSum(absoluteKelvinTerms(a, numeric, scope));
}

export function temperatureTargetScalar<T>(source: Quantity<T>, target: UnitStructure, reciprocal: boolean, constants: TemperatureConstants<T>): T
{
	const scope = source.cacheScope;
	const n = source.numeric, unit = constants.unit;

	const absolute = isTemperature(source);
	// The result constructor validates an unchanged kelvin/rankine interval.
	if (!reciprocal && !absolute && sameAbsoluteAndIntervalScale(target, source, scope))
	{
		return source.scalar;
	}

	if (!n.isFinite(source.scalar))
	{
		const sign = scalarSign(n, source.scalar);

		if (sign < 0)
		{
			rejectBelowZero();
		}

		return reciprocal && sign > 0 ? checkTemperatureRange(constants.boundary, n) : source.scalar;
	}

	const origin = absolute ? temperatureConstants(source.numerator[0].unit, n, scope) : undefined;
	// A positive catalog factor cannot change the sign. Inspect the input before
	// conversion or reciprocal rounding, including when it is already absolute zero.
	const sign = origin ? n.compare(source.scalar, origin.boundary) : scalarSign(n, source.scalar);

	if (sign < 0)
	{
		rejectBelowZero();
	}

	if (sign === 0)
	{
		return checkTemperatureRange(constants.boundary, n);
	}

	if (!canSumRationalTerms(n))
	{
		if (origin && (!n.isFinite(origin.boundary) || !n.isFinite(constants.boundary)))
		{
			return clamp(checkTemperatureRange(convertPointReading(source.scalar, n, n, scope, origin, constants), n), constants.boundary, n);
		}

		const kelvin = reciprocal ? scale(source.scalar, source, undefined, n, true, scope)
			: adapterPhysical(source, n, scope, origin);
		const reading = n.add(scaleReading(kelvin, unit, n, scope, true, constants), constants.boundary);

		return clamp(checkTemperatureRange(reading, n), constants.boundary, n);
	}

	const [num, den] = temperatures[unit];
	const minimum = boundaryTerm(constants, n, n, scope);
	const output = (terms: RationalTerm[]) => {
		const scaled = num === den ? terms : terms.map(term => scaleTerm(term, den, num));
		return clamp(n.fromRationalSum([...scaled, minimum]), constants.boundary, n);
	};

	if (origin)
	{
		return checkTemperatureRange(output(absoluteKelvinTerms(source, n, scope, origin)), n);
	}
	const value = baseUnitValue(source, n, reciprocal, scope);

	return checkTemperatureRange('exact' in value ? output([value.exact]) : evaluateRoundedScalar(n, [value], output), n);
}

function absoluteKelvinTerms<T>(a: Quantity<T>, n: ArithmeticAdapter<T>, scope: CacheScope,
	constants?: TemperatureConstants<T>): RationalTerm[]
{
	const unit = a.numerator[0].unit, [num, den] = temperatures[unit];
	const scalar = representedTerm(a.scalar, a.numeric, n, scope);
	const reading = num === den ? scalar : scaleTerm(scalar, num, den);

	return [reading, kelvinOffsetTerm(unit, a.numeric, n, scope, constants)];
}

/** A positive unit factor preserves order. For subtraction, express both points
 * relative to their own boundaries in the left point's degrees before rounding. */
function pointDifference<T>(a: Quantity<T>, b: Quantity<T>, compare: true): number;
function pointDifference<T>(a: Quantity<T>, b: Quantity<T>, compare: false): T;
function pointDifference<T>(a: Quantity<T>, b: Quantity<T>, compare: boolean): T | number
{
	const n = a.numeric, scope = a.cacheScope;
	const unit = a.numerator[0].unit, other = b.numerator[0].unit;
	const sameScale = unit === other;

	if (compare && sameScale && n === b.numeric)
	{
		return n.compare(a.scalar, b.scalar);
	}

	const evaluate: false | ((terms: Iterable<RationalTerm>) => T | number) = compare
		? canCompareRationalTerms(n) && n.compareRationalSum
		: canSumRationalTerms(n) && n.fromRationalSum;

	if (sameScale && n === b.numeric && (!evaluate || integerAsNumber(n, a.scalar) !== 0 || integerAsNumber(n, b.scalar) !== 0))
	{
		return n.sub(a.scalar, b.scalar);
	}

	if (!n.isFinite(a.scalar) || !n.isFinite(b.scalar))
	{
		return compare ? n.compare(a.scalar, b.scalar) : n.sub(a.scalar, b.scalar);
	}

	const left = temperatureConstants(unit, n, scope);
	const right = sameScale && n === b.numeric ? left : temperatureConstants(other, b.numeric, scope);
	const common = n === b.numeric || n.isValue(right.boundary);

	if (sameScale && common && n.compare(left.boundary, right.boundary) === 0)
	{
		if (compare)
		{
			return n.compare(a.scalar, b.scalar);
		}

		// For exact zero readings retain the zero sign produced by offset cancellation.
		if (!evaluate || integerAsNumber(n, a.scalar) !== 0 || integerAsNumber(n, b.scalar) !== 0)
		{
			return n.sub(a.scalar, b.scalar);
		}
	}

	if (!evaluate)
	{
		if (sameScale)
		{
			const readings = n.sub(a.scalar, b.scalar);
			const offset = common && n.isFinite(left.boundary) && n.isFinite(right.boundary)
				? n.sub(left.boundary, right.boundary) : offsetChange(right, b.numeric, n, scope, left);

			if (offset === undefined)
			{
				return compare ? n.compare(a.scalar, b.scalar) : readings;
			}

			return compare ? n.compare(readings, offset) : n.sub(readings, offset);
		}
		const localRight = !b.numeric.isFinite(right.boundary) && b.numeric !== n
			? temperatureConstants(other, n, scope) : right;

		if (!n.isFinite(left.boundary) || !n.isValue(localRight.boundary) || !n.isFinite(localRight.boundary)
			|| localRight !== right && boundaryAdjustment(b.numeric, n, scope, right, localRight) !== null)
		{
			const converted = convertPointReading(b.scalar, b.numeric, n, scope, right, left);
			return compare ? n.compare(a.scalar, converted) : n.sub(a.scalar, converted);
		}

		const x = adapterPhysical(a, n, scope, left), y = adapterPhysical(b, n, scope, localRight);

		return compare ? n.compare(x, y) : scaleReading(n.sub(x, y), unit, n, scope, true, left);
	}

	const [an, ad] = temperatures[unit], [bn, bd] = temperatures[other];
	const top = an === bn ? 1n : bn * ad, bottom = an === bn ? 1n : bd * an;
	const terms = [representedTerm(a.scalar, n, b.numeric, scope), scaleTerm(boundaryTerm(left, n, b.numeric, scope), -1n),
		scaleTerm(representedTerm(b.scalar, b.numeric, n, scope), -top, bottom),
		scaleTerm(boundaryTerm(right, b.numeric, n, scope), top, bottom)];
	return evaluate.call(n, terms);
}

/** Compare points in physical kelvin and intervals by their positive catalog scale. */
export function compareTemperatures<T>(a: Quantity<T>, b: Quantity<T>, aAbsolute: boolean): number
{
	const n = a.numeric, scope = a.cacheScope;

	if (aAbsolute && isTemperature(b))
	{
		return pointDifference(a, b, true);
	}

	// An interval compares a foreign point as it would be constructed in the receiver's context.
	if (!aAbsolute && b.numeric !== n)
	{
		b = a.createQuantity(b);
	}

	const point = aAbsolute ? a : b, interval = aAbsolute ? b : a;

	if (!n.isFinite(a.scalar) || !n.isFinite(b.scalar) || sameAbsoluteAndIntervalScale(point, interval, scope))
	{
		return n.compare(a.scalar, b.scalar);
	}

	if (!canCompareRationalTerms(n))
	{
		const x = adapterPhysical(point, n, scope), y = scale(interval.scalar, interval, undefined, n, false, scope);

		return aAbsolute ? n.compare(x, y) : n.compare(y, x);
	}

	const pointTerms = absoluteKelvinTerms(point, n, scope);
	const delta = baseUnitValue(interval, n, false, scope);
	const order = (term: RationalTerm) => n.compareRationalSum([...pointTerms, scaleTerm(term, -1n)]);
	const result = 'exact' in delta ? order(delta.exact) : evaluateRational([delta], ([term]) => order(term));

	return aAbsolute ? result : -result;
}

export function subtractTemperatures<T, C extends object>(a: Quantity<T, C>, b: Quantity<T>): Quantity<T, C>
{
	return a.createResult(pointDifference(a, b, false), temperatures[a.numerator[0].unit][3]);
}

/** Validate in the source scale, then round the reading in the receiver's scale once. */
function checkedReading<T>(reading: RationalTerm, source: ArithmeticAdapter<T>, n: ArithmeticAdapter<T> & RationalConstruction<T>, scope: CacheScope,
	origin: TemperatureConstants<T>, destination: TemperatureConstants<T>, delta?: RationalValue): T
{
	const negativeMinimum = scaleTerm(boundaryTerm(origin, source, n, scope), -1n);
	const terms = [reading];

	if (delta && 'exact' in delta)
	{
		terms.push(delta.exact);
	}

	const bounded = delta && 'bounds' in delta ? [delta] : undefined;
	const compare = (values: RationalTerm[]) => hasRationalComparison(n) ? n.compareRationalSum(values)
		: scalarSign(n, n.fromRationalSum(values));
	const sign = bounded ? evaluateRational(bounded, ([change]) => compare([reading, change, negativeMinimum]))
		: compare([...terms, negativeMinimum]);

	if (sign < 0)
	{
		rejectBelowZero();
	}

	if (sign === 0)
	{
		return checkTemperatureRange(destination.boundary, n);
	}

	const adjustment = boundaryAdjustment(source, n, scope, origin, destination);
	const finish = (values: RationalTerm[]) => clamp(n.fromRationalSum(adjustment ? [...values, ...adjustment] : values), destination.boundary, n);

	return checkTemperatureRange(bounded ? evaluateRoundedScalar(n, bounded, ([change]) => finish([reading, change])) : finish(terms), n);
}

/** Compare against the source boundary before translating the reading into the destination. */
function translateReading<T>(reading: T, sign: number, from: T, to: T, n: ArithmeticAdapter<T>): T
{
	if (sign < 0)
	{
		rejectBelowZero();
	}

	if (sign === 0)
	{
		return to;
	}

	return translateAboveZero(reading, from, to, n);
}

/** Shift an absolute reading by an interval without rounding the validation operands. */
export function changeTemperature<T, C extends object>(temp: Quantity<T>, interval: Quantity<T>, subtract: boolean, owner: Quantity<T, C>): Quantity<T, C>
{
	const n = owner.numeric, scope = owner.cacheScope;
	const destination = temperatureConstants(temp.numerator[0].unit, n, scope);
	const scalar = shiftReading(temp, interval, subtract, n, scope, destination);

	return owner[makeResult](scalar, temp, destination);
}

function shiftReading<T>(temp: Quantity<T>, interval: Quantity<T>, subtract: boolean, n: ArithmeticAdapter<T>,
	scope: CacheScope, destination: TemperatureConstants<T>): T
{
	const source = temp.numeric, origin = source === n ? destination : temperatureConstants(destination.unit, source, scope);
	const finite = n.isFinite(temp.scalar) && n.isFinite(interval.scalar);
	const matching = matchingInterval(temp, interval);

	if (finite && canSumRationalTerms(n))
	{
		const reading = representedTerm(temp.scalar, source, n, scope);
		const term = representedTerm(interval.scalar, interval.numeric, n, scope);

		// Rational zero has no sign. Positive interval factors preserve the input zero's sign.
		if (!reading.numerator && !term.numerator && boundaryAdjustment(source, n, scope, origin, destination) === null)
		{
			return subtract ? n.sub(temp.scalar, interval.scalar) : n.add(temp.scalar, interval.scalar);
		}

		const delta = matching || !term.numerator ? { exact: term } : scaledTerm(term, interval, temp, false, scope);

		return checkedReading(reading, source, n, scope, origin, destination, subtract ? negateValue(delta) : delta);
	}

	const direction = scalarSign(n, interval.scalar) * (subtract ? -1 : 1);

	if (finite && source !== n && direction === 0)
	{
		return applyTemperatureIdentity(temp, n, scope, destination, origin,
			reading => subtract ? n.sub(reading, interval.scalar) : n.add(reading, interval.scalar));
	}

	const atZero = source.compare(temp.scalar, origin.boundary) === 0;
	if (atZero && direction < 0)
	{
		rejectBelowZero();
	}

	const delta = matching ? interval.scalar : scale(interval.scalar, interval, temp, n, false, scope);
	const reading = subtract ? n.sub(temp.scalar, delta) : n.add(temp.scalar, delta);

	if (!finite)
	{
		return reading;
	}

	if (source === n)
	{
		return checkTemperatureRange(reading, n);
	}

	if (!n.isValue(origin.boundary) || !n.isFinite(origin.boundary) || !n.isFinite(destination.boundary))
	{
		const offset = offsetChange(origin, source, n, scope, destination);
		const shifted = offset === undefined ? reading : n.add(reading, offset);

		if (n.isFinite(shifted))
		{
			return shifted;
		}

		// A wider source may still be able to compare the cooling with the distance to zero.
		if (direction < 0 && scalarSign(n, shifted) < 0 && source.isFinite(origin.boundary) &&
			source.isValue(delta) && source.isFinite(delta))
		{
			const available = source.sub(temp.scalar, origin.boundary);

			if (source.compare(available, subtract ? delta : source.neg(delta)) < 0)
			{
				rejectBelowZero();
			}
		}

		return checkTemperatureRange(shifted, n);
	}

	const from = origin.boundary;

	if (n.compare(from, destination.boundary) === 0)
	{
		return reading;
	}

	if (atZero)
	{
		return subtract ? n.sub(destination.boundary, delta) : n.add(destination.boundary, delta);
	}

	// Compare cooling against the available distance before rounding the displayed reading.
	const sign = direction < 0 ? n.compare(n.sub(temp.scalar, from), subtract ? delta : n.neg(delta)) : 1;

	return translateReading(reading, sign, from, destination.boundary, n);
}

/** Scalar multiplication/division uses the same physical-boundary rules as addition. */
export function scaleTemperature<T, C extends object>(temp: Quantity<T>, factor: T, divide: boolean, owner: Quantity<T, C>): Quantity<T, C>
{
	const n = owner.numeric, scope = owner.cacheScope, unit = temp.numerator[0].unit;
	const destination = temperatureConstants(unit, n, scope);
	const scalar = temp.numeric !== n && !canSumRationalTerms(n) && integerAsNumber(n, factor) === 1
		? applyTemperatureIdentity(temp, n, scope, destination, undefined,
			reading => divide ? n.div(reading, factor) : n.mul(reading, factor))
		: scaleTemperatureReading(unit, temp.scalar, factor, divide, n, scope, temp.numeric, destination);

	return owner[makeResult](scalar, temp, destination);
}

/** Scale a displayed reading using the source boundary and the receiver's final rounding. */
export function scaleTemperatureReading<T>(unit: string, reading: T, factor: T, divide: boolean,
	n: ArithmeticAdapter<T>, scope: CacheScope, source: ArithmeticAdapter<T> = n, destination = temperatureConstants(unit, n, scope)): T
{
	const origin = source === n ? destination : temperatureConstants(unit, source, scope);
	const exactBoundary = canSumRationalTerms(n);
	const finiteInputs = n.isFinite(reading) && n.isFinite(factor);

	if (finiteInputs)
	{
		if (exactBoundary)
		{
			const a = representedTerm(reading, source, n, scope);
			const b = representedTerm(factor, n, source, scope);

			// Rational terms have unsigned zero. Keep exact zero operands in the backend.
			if (a.numerator && b.numerator)
			{
				const term = divide ? scaleTerm({ ...a, exponent: a.exponent - b.exponent }, b.denominator, b.numerator)
					: scaleTerm({ ...a, exponent: a.exponent + b.exponent }, b.numerator, b.denominator);
				return checkedReading(term, source, n, scope, origin, destination);
			}
		}
		else
		{
			if (integerAsNumber(source, origin.boundary) === 0)
			{
				// A negative finite product or quotient may underflow to signed zero.
				const readingSign = scalarSign(n, reading), factorSign = scalarSign(n, factor);

				if ((readingSign > 0 && factorSign < 0) || (readingSign < 0 && factorSign > 0))
				{
					rejectBelowZero();
				}
			}
		}
	}

	const scalar = divide ? n.div(reading, factor) : n.mul(reading, factor);

	if (!finiteInputs)
	{
		return scalar;
	}

	if (source === n)
	{
		return checkTemperatureRange(scalar, n);
	}

	const to = destination.boundary;

	if (exactBoundary)
	{
		if (!n.isFinite(scalar))
		{
			return scalar;
		}

		const sameBoundary = boundaryAdjustment(source, n, scope, origin, destination) === null;

		if (sameBoundary)
		{
			return scalar;
		}

		return checkedReading(representedTerm(scalar, n, source, scope), source, n, scope, origin, destination);
	}

	if (!n.isValue(origin.boundary) || !n.isFinite(origin.boundary) || !n.isFinite(to))
	{
		// Only a finite source boundary can identify absolute zero before translation.
		if (source.isFinite(origin.boundary) && source.isValue(factor))
		{
			const product = divide ? source.div(reading, factor) : source.mul(reading, factor);
			const order = source.compare(product, origin.boundary);

			if (order < 0)
			{
				rejectBelowZero();
			}

			if (order === 0)
			{
				return checkTemperatureRange(to, n);
			}
		}

		const offset = offsetChange(origin, source, n, scope, destination);

		return checkTemperatureRange(offset === undefined ? scalar : n.add(scalar, offset), n);
	}

	const from = origin.boundary;
	// Compare at the receiver's precision first. When both results round together,
	// use the original operands in the source context to distinguish them.
	let sign = n.compare(scalar, n.add(from, n.sub(factor, factor)));

	if (sign === 0 && source.isValue(factor))
	{
		const product = divide ? source.div(reading, factor) : source.mul(reading, factor);
		sign = source.compare(product, from);
	}

	if (sign < 0)
	{
		rejectBelowZero();
	}

	if (sign === 0)
	{
		return checkTemperatureRange(to, n);
	}

	if (n.compare(from, to) === 0)
	{
		return clamp(checkTemperatureRange(scalar, n), to, n);
	}

	return translateAboveZero(scalar, from, to, n);
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
