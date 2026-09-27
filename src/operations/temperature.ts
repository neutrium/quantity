import { Decimal } from '@neutrium/decimal';
import { TEMPERATURE_SIGNATURE } from './unit-signatures.js';

import type { Quantity } from '../QuantityCore.js'
import type { UnitStructure } from '../QuantityDefinition.js';
import { normalizePowers, UNITY } from './unit-powers.js';

import { calculateScalar, type DecimalConstructor } from './numeric-context.js';
import { resolveUnitValue, unitValue } from './unit-scale.js';
import { decimalTerm, scaleTerm, compareSum, roundSum, evaluateRational, type RationalTerm } from './exact-sum.js';


export function isTemperature(a: Quantity) : boolean
{
	return isDegrees(a) && /<temp-[CFRK]>/.test(a.numerator[0].unit);
}

export function isDegrees(a: Quantity) : boolean
{
	// signature may not have been calculated yet
	return (a.signature === undefined || a.signature === TEMPERATURE_SIGNATURE) &&
		a.numerator.length === 1 &&
		a.denominator.length === 0 && a.numerator[0].exponent === 1 && !a.numerator[0].prefix &&
		(/<temp-[CFRK]>/.test(a.numerator[0].unit) || /<(kelvin|celsius|rankine|fahrenheit)>/.test(a.numerator[0].unit));
}

export function addTempDegrees(temp: Quantity, deg: Quantity, resultOwner: Quantity = temp): Quantity
{
	return changeTemperature(temp, deg, false, resultOwner);
}

export function subtractTempDegrees(temp: Quantity, deg: Quantity): Quantity
{
	return changeTemperature(temp, deg, true, temp);
}

function changeTemperature(temp: Quantity, deg: Quantity, subtract: boolean, owner: Quantity): Quantity
{
	const unit = temp.numerator[0].unit;
	const scalar = !temp.scalar.isFinite() || !deg.scalar.isFinite()
		? calculateScalar(temp.scalar, subtract ? 'sub' : 'add', deg.scalar, owner.decimal)
		: checkedTemperature(evaluateRational([unitValue(deg, getDegreeUnits(temp))], ([term]) =>
			temperatureResult([decimalTerm(temp.scalar), scaleTerm(term, subtract ? -1n : 1n)], unit, owner.decimal)));
	return owner.createQuantity({ scalar, numerator: temp.numerator, denominator: temp.denominator });
}

export function subtractTemperatures(a: Quantity, b: Quantity): Quantity
{
	const scale = SCALES[a.numerator[0].unit];
	const terms = () => [...absoluteTerms(a.scalar, a.numerator[0].unit),
		...absoluteTerms(b.scalar, b.numerator[0].unit).map(term => scaleTerm(term, -1n))];
	const scalar = !a.scalar.isFinite() || !b.scalar.isFinite()
		? calculateScalar(a.scalar, 'sub', b.scalar, a.decimal)
		: roundSum(terms().map(term => scaleTerm(term, BigInt(scale[1]), BigInt(scale[0]))), a.decimal);
	const degrees = getDegreeUnits(a);
	return a.createQuantity({ scalar, numerator: degrees.numerator, denominator: degrees.denominator });
}

/** Scale the existing absolute reading; validate the exact product/quotient before rounding. */
export function scaleTemperature(temp: Quantity, factor: number | Decimal, divide: boolean, owner: Quantity = temp): Quantity
{
	const operand = typeof factor === 'number' ? new Comparison(factor) : factor;
	let scalar: Decimal;

	if (!temp.scalar.isFinite() || !operand.isFinite() || divide && operand.isZero())
	{
		scalar = calculateScalar(temp.scalar, divide ? 'div' : 'mul', operand, owner.decimal);
	}
	else
	{
		const a = decimalTerm(temp.scalar), b = decimalTerm(operand);
		const coefficient = divide ? scaleTerm(a, b.denominator, b.numerator) : scaleTerm(a, b.numerator, b.denominator);
		const term = { ...coefficient, exponent: coefficient.exponent + (divide ? -b.exponent : b.exponent) };
		scalar = checkedTemperature(temperatureResult([term], temp.numerator[0].unit, owner.decimal));
	}

	return owner.createQuantity({ scalar, numerator: temp.numerator, denominator: temp.denominator });
}

export function toDegrees(src: Quantity, dst: Quantity): Quantity
{
	if (!dst.isDegrees() || dst.isTemperature())
	{
		throw new Error("Unknown type for degree conversion to: " + dst.units());
	}

	return src.createQuantity({
		// Interpret an absolute reading as an interval, and cancel equal ratios
		// before rounding (for example, degF -> degR at low precision).
		scalar: resolveUnitValue(src, dst, src.decimal),
		numerator: dst.numerator,
		denominator: dst.denominator
	});
}

// Kelvin = (reading + offset) * numerator / denominator.
const SCALES: Record<string, readonly [number, number, string]> = {
	'<temp-K>': [1, 1, '0'], '<temp-C>': [1, 1, '273.15'],
	'<temp-F>': [5, 9, '459.67'], '<temp-R>': [5, 9, '0'],
};
const OFFSETS: Record<string, RationalTerm> = Object.fromEntries(Object.entries(SCALES)
	.map(([unit, scale]) => [unit, Object.freeze(decimalTerm(scale[2]))]));

export function isBelowAbsoluteZero(qty: Quantity): boolean
{
	return new Comparison(qty.scalar).lt('-' + SCALES[qty.numerator[0].unit][2]);
}

function absoluteTerms(value: Decimal, unit: string): RationalTerm[]
{
	const [numerator, denominator] = SCALES[unit];
	return [decimalTerm(value), OFFSETS[unit]].map(term => scaleTerm(term, BigInt(numerator), BigInt(denominator)));
}

type TemperatureResult = Decimal | 'below-absolute-zero';

/** A common boundary policy for conversion and arithmetic; never validate a rounded reading. */
function temperatureResult(terms: RationalTerm[], unit: string, Output: DecimalConstructor): TemperatureResult
{
	const offset = SCALES[unit][2];
	const boundary = compareSum([...terms, OFFSETS[unit]]);

	if (boundary < 0)
	{
		return 'below-absolute-zero';
	}

	const minimum = offset === '0' ? '0' : '-' + offset;

	if (boundary === 0)
	{
		return new Output(minimum);
	}

	const rounded = roundSum(terms, Output);

	return rounded.lt(minimum) ? new Output(minimum) : rounded;
}

function checkedTemperature(result: TemperatureResult): Decimal
{
	if (result === 'below-absolute-zero')
	{
		throw new Error('Temperatures must not be less than absolute zero');
	}

	return result;
}

/** Evaluate the complete affine conversion with exact cancellation and one final rounding. */
export function temperatureValue(value: Decimal, source: string, target: string, Output: DecimalConstructor): Decimal
{
	const from = SCALES[source], to = SCALES[target];

	if (!from || !to)
	{
		throw new Error('Unknown absolute temperature unit');
	}

	if (!value.isFinite())
	{
		return new Output(value);
	}

	const terms = absoluteTerms(value, source).map(term => scaleTerm(term, BigInt(to[1]), BigInt(to[0])));
	terms.push(scaleTerm(OFFSETS[target], -1n));

	return checkedTemperature(temperatureResult(terms, target, Output));
}

/** Convert physical kelvin (optionally a reciprocal) through the same exact affine path. */
export function toTemp(src: Quantity, dst: Quantity, reciprocal = false): Quantity
{
	if (reciprocal && src.scalar.isZero())
	{
		throw new Error('Divide by zero');
	}

	const target = dst.numerator[0].unit, scale = SCALES[target];
	const scalar = src.isTemperature() ? temperatureValue(src.scalar, src.numerator[0].unit, target, src.decimal)
		: !src.scalar.isFinite() ? temperatureValue(reciprocal ? new src.decimal(1).div(src.scalar) : src.scalar,
			'<temp-K>', target, src.decimal)
		: checkedTemperature(evaluateRational([unitValue(src, undefined, reciprocal)], ([term]) => temperatureResult([
			scaleTerm(term, BigInt(scale[1]), BigInt(scale[0])), scaleTerm(OFFSETS[target], -1n),
		], target, src.decimal)));
	return src.createQuantity({ scalar, numerator: dst.numerator, denominator: dst.denominator });
}

export function toTempK(qty: Quantity): Quantity
{
	return qty.createQuantity({
		scalar: qty.isTemperature() ? temperatureBaseScalar(qty.scalar, qty.numerator[0].unit, qty.decimal) : qty.baseScalar,
		numerator: [{ unit: '<temp-K>', exponent: 1 }], denominator: [],
	});
}

export function temperatureBaseScalar(scalar: Decimal, unit: string, Output: DecimalConstructor = Decimal): Decimal
{
	return temperatureValue(scalar, unit, '<temp-K>', Output);
}

// Range-independent boundary checks and numeric scalar inputs; arithmetic uses exact terms.
const Comparison = Decimal.clone({ precision: 64, rounding: 'half-up', maxOutputDigits: Decimal.limits.maxDigits,
	minE: -Decimal.limits.maxExponent, maxE: Decimal.limits.maxExponent });
export function compareTemperatures(a: Quantity, b: Quantity): number
{
	if (!a.scalar.isFinite() || !b.scalar.isFinite())
	{
		return a.scalar.cmp(b.scalar);
	}

	if (a.isTemperature() && b.isTemperature())
	{
		return compareSum([
			...absoluteTerms(a.scalar, a.numerator[0].unit),
			...absoluteTerms(b.scalar, b.numerator[0].unit).map(term => scaleTerm(term, -1n)),
		]);
	}
	const absolute = a.isTemperature() ? a : b, interval = a.isTemperature() ? b : a;
	const terms = absoluteTerms(absolute.scalar, absolute.numerator[0].unit);
	const result = evaluateRational([unitValue(interval)], ([term]) => compareSum([...terms, scaleTerm(term, -1n)]));
	return a.isTemperature() ? result : -result;
}

function degreeStructure(unit: string): Readonly<UnitStructure>
{
	return Object.freeze({ numerator: normalizePowers([{ unit, exponent: 1 }]), denominator: UNITY });
}

const DEGREE_UNITS = new Map<string, Readonly<UnitStructure>>([
	['<temp-C>', degreeStructure('<celsius>')],
	['<temp-F>', degreeStructure('<fahrenheit>')],
	['<temp-K>', degreeStructure('<kelvin>')],
	['<temp-R>', degreeStructure('<rankine>')]
]);

// Resolve absolute-temperature units to interval tokens without parsing display text.
export function getDegreeUnits(temperature: Quantity): Readonly<UnitStructure>
{
	const units = DEGREE_UNITS.get(temperature.numerator[0]?.unit);

	if (!temperature.isTemperature() || !units)
	{
		throw new Error("Expected an absolute temperature");
	}

	return units;
}
