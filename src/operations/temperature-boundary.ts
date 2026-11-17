import type { ArithmeticAdapter } from '@neutrium/math/numeric/arithmetic';
import { hasRationalExtraction, parseRationalTerm, scaleTerm } from '@neutrium/math/numeric/rational';
import type { RationalTerm } from '@neutrium/math/numeric/factors';
import type { UnitStructure } from '../QuantityDefinition.js';
import { FIVE_NINTHS } from '../data/TemperatureFactors.js';
import type { CacheScope } from '../utils/CacheScope.js';
import { normalizePowers, UNITY } from './unit-powers.js';
import { compareRatioToOne, scalarTerm } from './rational-terms.js';

/** Fixed catalog structures contain no scalar, adapter or cache state. */
function temperatureUnits(unit: string): UnitStructure
{
	return Object.freeze({ numerator: normalizePowers([{ unit, exponent: 1 }]), denominator: UNITY });
}

/** Shared absolute-kelvin result units, including when optional caches are disabled. */
export const ABSOLUTE_KELVIN_UNITS = temperatureUnits('<temp-K>');

/** Internal result construction can carry the receiver's resolved boundary through subclass hooks. */
export const makeResult = Symbol('makeResult');

// Kelvin = (reading + offset) * numerator / denominator; final entry is the interval structure.
export const temperatures: Record<string, readonly [bigint, bigint, string, UnitStructure]> = {
	'<temp-K>': [1n, 1n, '0', temperatureUnits('<kelvin>')],
	'<temp-C>': [1n, 1n, '273.15', temperatureUnits('<celsius>')],
	'<temp-F>': [...FIVE_NINTHS, '459.67', temperatureUnits('<fahrenheit>')],
	'<temp-R>': [...FIVE_NINTHS, '0', temperatureUnits('<rankine>')],
};

export interface TemperatureConstants<T>
{
	readonly unit: string;
	readonly boundary: T;
	term?: RationalTerm;
	/** Offset already expressed in kelvin. */
	offset?: RationalTerm;
	ratio?: readonly [T, T];
	/** Destination minus source boundary, or null when they coincide. */
	adjustments?: WeakMap<object, readonly [RationalTerm, RationalTerm] | null>;
}

// The adapter instance identifies an immutable configuration. Weak keys release
// discarded contexts and source adapters used for copies.
const constantsKey = Symbol();

export function temperatureConstants<T>(unit: string, numeric: ArithmeticAdapter<T>, scope: CacheScope): TemperatureConstants<T>
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
		value = { unit, boundary: numeric.from(offset === '0' ? '0' : '-' + offset) };
		scales?.set(unit, value);
	}

	return value;
}

export function hasZeroTemperatureOffset(absolute: UnitStructure): boolean
{
	return temperatures[absolute.numerator[0].unit][2] === '0';
}

function catalogBoundaryTerm(unit: string): RationalTerm
{
	return parseRationalTerm('-' + temperatures[unit][2]);
}

/** Safe integers are exact doubles. Other opaque readings need the owner's numeric text. */
export function temperatureLiteral<T>(value: T, owner: ArithmeticAdapter<T>): number | string
{
	if (typeof value === 'number')
	{
		return value;
	}

	if (owner.isInteger(value))
	{
		const native = owner.toNumber(value);
		if (Number.isSafeInteger(native)) return native;
	}

	const text = owner.toString(value);

	if (owner.compare(owner.from(text), value) !== 0)
	{
		throw new TypeError('Temperature calculation requires round-trippable numeric text or rational extraction');
	}

	return text;
}

/** Prefer the owning adapter's exact value, then an extractor recognizing its representation. */
export function representedTerm<S, T>(value: S, owner: ArithmeticAdapter<S>, other: ArithmeticAdapter<T>, scope: CacheScope): RationalTerm
{
	if (hasRationalExtraction(owner))
	{
		return scalarTerm(value, owner, scope);
	}

	if (hasRationalExtraction(other) && other.isValue(value))
	{
		return scalarTerm(value, other, scope);
	}

	return parseRationalTerm(String(temperatureLiteral(value, owner)));
}

/** A finite boundary belongs to its adapter. Outside its range the catalog defines zero. */
export function boundaryTerm<S, T>(constants: TemperatureConstants<S>, owner: ArithmeticAdapter<S>, other: ArithmeticAdapter<T>, scope: CacheScope): RationalTerm
{
	if (constants.term)
	{
		return constants.term;
	}

	if (!owner.isFinite(constants.boundary))
	{
		return constants.term = catalogBoundaryTerm(constants.unit);
	}

	// Only cache an extraction independent of the other adapter's capabilities.
	if (hasRationalExtraction(owner))
	{
		return constants.term = scalarTerm(constants.boundary, owner, scope);
	}

	return representedTerm(constants.boundary, owner, other, scope);
}

/** Translate an exact reading by destination zero minus source zero before final rounding. */
export function boundaryAdjustment<S, T>(source: ArithmeticAdapter<S>, receiver: ArithmeticAdapter<T>, scope: CacheScope,
	origin: TemperatureConstants<S>, destination: TemperatureConstants<T>): readonly [RationalTerm, RationalTerm] | null
{
	if (Object.is(source, receiver))
	{
		return null;
	}

	let adjustment = destination.adjustments?.get(source);

	if (adjustment === undefined)
	{
		const from = boundaryTerm(origin, source, receiver, scope);
		const to = hasRationalExtraction(source) && source.isValue(destination.boundary)
			? boundaryTerm(destination, receiver, source, scope) : boundaryTerm(destination, receiver, receiver, scope);
		// Both catalog boundaries are nonpositive. Compare their magnitudes without rounding either offset.
		const equal = !from.numerator || !to.numerator ? from.numerator === to.numerator :
			compareRatioToOne({ numerator: -from.numerator * to.denominator,
				denominator: -to.numerator * from.denominator, exponent: from.exponent - to.exponent }) === 0;
		adjustment = equal ? null : [to, scaleTerm(from, -1n)];

		if (scope.enabled('temperatureConstants'))
		{
			(destination.adjustments ??= new WeakMap()).set(source, adjustment);
		}
	}

	return adjustment;
}

/** Offset in kelvin, derived from the reading's own represented zero. */
export function kelvinOffsetTerm<T>(unit: string, source: ArithmeticAdapter<T>, receiver: ArithmeticAdapter<T>, scope: CacheScope,
	constants = temperatureConstants(unit, source, scope)): RationalTerm
{
	if (constants.offset)
	{
		return constants.offset;
	}

	const [num, den] = temperatures[unit];
	const offset = scaleTerm(boundaryTerm(constants, source, receiver, scope), -num, den);

	if (constants.term)
	{
		constants.offset = offset;
	}

	return offset;
}

export function scaleReading<T>(value: T, unit: string, n: ArithmeticAdapter<T>, scope: CacheScope, inverse = false,
	constants?: TemperatureConstants<T>): T
{
	const [num, den] = temperatures[unit];

	if (num === den)
	{
		return value;
	}

	constants ??= temperatureConstants(unit, n, scope);
	const [top, bottom] = constants.ratio ??= [n.from(num), n.from(den)];
	const multiplier = inverse ? bottom : top, divisor = inverse ? top : bottom;
	const product = n.mul(value, multiplier);

	// A finite native reading may overflow the product while the quotient still fits.
	return n.isFinite(product) ? n.div(product, divisor) : n.mul(value, n.div(multiplier, divisor));
}
