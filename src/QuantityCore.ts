/*!
Copyright © 2006-2007 Kevin C. Olbrich
Copyright © 2010-2013 LIM SAS (http://lim.eu) - Julien Sanchez
Copyright © 2016-2026 Native Dynamics (nativedynamics.com.au) - Trevor Walker

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import { typeguards } from "@neutrium/utilities";
import { Decimal } from '@neutrium/decimal';
import { isolatedDecimal, type DecimalConstructor } from './operations/numeric-context.js';

import type { QuantityDefinition, UnitPower, UnitStructure } from './QuantityDefinition.js'
import type { QuantityInitParam } from './guards.js'

import type { Parser } from './parsers/Parser.js'
import type { QuantityConfigInput } from './QuantityConfig.js';
import { DEFAULT_PARSER_CONFIG, parserConfig, type ParserConfig } from './parsers/ParserConfig.js';
import { UnitTokenManager } from "./UnitTokenManager.js";

// Import operators
import { add, sub, mul, div, pow, inverse } from './operations/maths.js'
import { isDegrees, isTemperature, toDegrees, toTemp, toTempK, temperatureBaseScalar, isBelowAbsoluteZero } from "./operations/temperature.js";
import { compareTo, eq, gt, gte, isCompatible, isInverse, isUnitless, lt, lte, same } from './operations/comparison.js';
import { throwIncompatibleUnits } from "./operations/errors.js";
import { unitSignature, TEMPERATURE_SIGNATURE } from './operations/unit-signatures.js'
import { stringifyUnits } from './operations/unit-strings.js';
import { cancelPowers, normalizePowers, UNITY } from './operations/unit-powers.js';
import { sameUnits, unitKey } from './operations/unit-identity.js';
import { resolveUnitValue, resolveReciprocal } from './operations/unit-scale.js';
import { LruCache } from './utils/LruCache.js';
import { cacheConfig, DEFAULT_CACHE_CONFIG, type CacheConfig } from './utils/CacheConfig.js';
import { BudgetCache } from './utils/BudgetCache.js';
import { conversionExpressionPolicy, conversionResultPolicy } from './operations/conversion-cache.js';

const isString = typeguards.isString;

/** Read numeric object inputs once and validate them as scalars, never unit expressions. */
function scalarInput(input: unknown): string | number | Decimal
{
	if (typeof input === 'number' || input instanceof Decimal)
	{
		return input;
	}

	const text = typeof input === 'string' ? input
		: input !== null && typeof input === 'object' && typeof input.toString === 'function' ? input.toString() : undefined;

	if (typeof text !== 'string')
	{
		throw new TypeError('Expected a number, Decimal, or numeric string representation');
	}

	const trimmed = text.trim();

	if (trimmed.startsWith('+-'))
	{
		throw new TypeError('Invalid numeric scalar');
	}

	return trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
}

interface BaseUnitMetadata extends UnitStructure
{
	readonly signature: string;
}

/**
 * A decimal scalar paired with units, with conversion, arithmetic, and comparison operations.
 *
 * Import from `@neutrium/quantity`. Construct quantities with `new` and read the
 * numerical result through {@link scalar}; {@link units} returns the unit expression.
 *
 * @remarks
 * Arithmetic produces quantities without changing the operands. Conversions may
 * return the same instance or a cached result. Treat quantities and their unit
 * arrays as immutable. Public values are getter-only; create a new quantity to change
 * them. Counted unit records and arrays are frozen and may be shared.
 *
 * Methods are shared on the prototype and require a Quantity receiver. When
 * passing a method as a callback, use an arrow wrapper or bind it to the instance.
 *
 * @example
 * ```ts
 * import { Quantity } from '@neutrium/quantity';
 *
 * const speed = new Quantity('100 km').div('2 h').to('km/h');
 * speed.scalar.toString(); // "50"
 * speed.units(); // "km/h"
 * ```
 * @see {@link Quantity.Quantity.constructor | Creating quantities}
 * @see {@link Quantity.to | Converting units}
 */
export class Quantity
{
	private static BASE_UNITS = ["<meter>", "<kilogram>", "<second>", "<mole>", "<ampere>", "<radian>", "<kelvin>", "<temp-K>", "<byte>", "<dollar>", "<candela>", "<each>", "<steradian>", "<bel>"];
	private static UNITY_ARRAY = UNITY;

	// Structural metadata is independent of Decimal precision, rounding, and range.
	private static baseUnitCache = new LruCache<string, BaseUnitMetadata>();
	protected static decimalConstructor: DecimalConstructor = Decimal;
	protected static parserOptions: ParserConfig = DEFAULT_PARSER_CONFIG;
	protected static conversionOptions: CacheConfig = DEFAULT_CACHE_CONFIG;

	/**
	 * Create a class with isolated numerical settings and optional cache limits.
	 * @param config - Decimal overrides, `parser` settings and `conversionCache` limits, merged with this class's settings.
	 * @returns A new class whose instances and derived results retain these settings.
	 * @remarks Subclasses with a different constructor signature must override the
	 * protected `constructQuantity` hook. Configuration preserves a constructor's
	 * signature; it does not supply additional subclass arguments to derived results.
	 * @category Construction
	 */
	static withConfig<T extends new (...args: never[]) => Quantity>(this: T, config: QuantityConfigInput): T
	{
		if (!config || typeof config !== 'object' || Array.isArray(config))
		{
			throw new TypeError('Expected Quantity configuration object');
		}

		const Base = this as unknown as typeof Quantity;
		const { parser, conversionCache, ...decimal } = config;
		const options = parserConfig(parser, Base.parserOptions);
		const conversions = cacheConfig(conversionCache, Base.conversionOptions, 'conversion cache');
		class ConfiguredQuantity extends Base {}
		Object.defineProperty(ConfiguredQuantity, 'decimalConstructor', { value: isolatedDecimal(Base.decimalConstructor, decimal) });
		Object.defineProperty(ConfiguredQuantity, 'parserOptions', { value: options });
		Object.defineProperty(ConfiguredQuantity, 'conversionOptions', { value: conversions });

		return ConfiguredQuantity as unknown as T;
	}

	/** Effective settings; isolated classes keep this frozen snapshot for their lifetime. */
	static get config()
	{
		return this.decimalConstructor.config;

	}
	/** Effective parser settings; configuring parser options creates a separate cache scope. */
	static get parserConfig(): ParserConfig
	{
		return this.parserOptions;
	}
	/** Effective parser settings, including an explicitly supplied parser's settings when exposed. */
	get parserConfig(): ParserConfig
	{
		return this.parser.config ?? (this.constructor as typeof Quantity).parserConfig;
	}
	/** Immutable limits applied separately to each instance's conversion caches. */
	static get conversionCacheConfig(): CacheConfig
	{
		return this.conversionOptions;
	}
	/** Effective conversion-cache limits, retained by derived quantities. */
	get conversionCacheConfig(): CacheConfig
	{
		return (this.constructor as typeof Quantity).conversionCacheConfig;
	}
	/** @internal Arithmetic constructor for this quantity. */
	get decimal(): DecimalConstructor
	{
		return this.#decimal;
	}
	#decimal = (this.constructor as typeof Quantity).decimalConstructor;
	/** Effective Decimal settings for this quantity. */
	get config()
	{
		return this.decimal.config;
	}
	private static stringifiedUnitsCache = new WeakMap<readonly UnitPower[], string>();
	private static stringifiedDenominatorCache = new WeakMap<readonly UnitPower[], string>();
	private conversionCache?: BudgetCache<Quantity>;
	private conversionExpressionCache?: BudgetCache<string | null>;
	private numericConfiguration = this.decimal.config;
	private _baseScalar?: Decimal;

	private parser: Parser<QuantityDefinition>;

	// Instance variables
	/**
	 * The original scalar/string input, or a normalized value-and-units snapshot
	 * for Quantity and definition inputs. Numeric toString() objects are saved as
	 * their parsed Decimal scalar. Copies do not retain the source object.
	 * @category Values
	 */
	get initValue(): QuantityInitParam
	{
		return this.#initValue;
	}
	#initValue: QuantityInitParam;
	/**
	 * Numerical value in this quantity's units, stored as `@neutrium/decimal` Decimal.
	 *
	 * Use `scalar.toString()` to retain decimal digits, or `scalar.toNumber()` when a
	 * JavaScript number is needed and floating-point rounding is acceptable.
	 * Read-only; create a new quantity to change the value.
	 * @category Values
	 */
	get scalar(): Decimal
	{
		return this.#scalar;
	}
	#scalar: Decimal;
	/**
	 * Counted numerator units, such as `[{ unit: "<meter>", exponent: 2 }]`.
	 * Records and arrays are frozen; exponents never expand into repeated entries.
	 * @see {@link units} for a human-readable expression.
	 * @category Values
	 */
	get numerator(): readonly UnitPower[]
	{
		return this.#numerator;
	}
	#numerator = Quantity.UNITY_ARRAY;
	/**
	 * Counted denominator units; an empty array represents unity. Records and arrays are frozen.
	 * @see {@link units} for a human-readable expression.
	 * @category Values
	 */
	get denominator(): readonly UnitPower[]
	{
		return this.#denominator;
	}
	#denominator = Quantity.UNITY_ARRAY;
	/**
	 * Lazily calculated numerical value in base units; absolute temperatures use kelvin.
	 * Recomputed on access when the shared Decimal configuration changes.
	 * @see {@link toBase} for a quantity with base units and this value.
	 * @category Values
	 */
	get baseScalar(): Decimal
	{
		return this.updateBaseScalar();
	}
	/**
	 * Cached dimensional signature. Prefer {@link isCompatible} over interpreting this string.
	 * @category Values
	 */
	get signature(): string
	{
		return this.#signature;
	}
	#signature: string;
	private _isBase?: boolean;
	private _units?: string;
	private _baseUnits?: BaseUnitMetadata;
	private tokenMapper: UnitTokenManager;

	/**
	 * Create a quantity from an expression, a scalar and units, or a parsed definition.
	 *
	 * @param initValue - A full expression such as `"3 m"`, a scalar paired with
	 * `initUnits`, or a {@link QuantityDefinition} / existing Quantity.
	 * @param initUnits - Nonempty unit expression for a separate scalar. A scalar in
	 * this expression is replaced by `initValue`. Ignored for quantity definitions.
	 * @param parser - Parser used for string expressions; supplied by the configured entry point.
	 * Required even for definitions; retained for subsequent string operations.
	 * @throws If inputs cannot be parsed, an absolute temperature is below absolute
	 * zero, or absolute-temperature units occur in a compound expression.
	 *
	 * @remarks
	 * Numbers, Decimal instances, numeric strings and objects with numeric `toString()`
	 * output create dimensionless quantities when units are omitted or empty. Use a
	 * decimal string or Decimal when preserving all input digits matters.
	 *
	 * @example
	 * ```ts
	 * const length = new Quantity('1.25', 'm');
	 * const unit = new Quantity('m'); // scalar defaults to 1
	 * const ratio = new Quantity(2); // dimensionless
	 * const copy = new Quantity(length);
	 * ```
	 * @category Construction
	 */
	constructor(
		initValue: QuantityInitParam,
		initUnits: string | undefined,
		parser: Parser<QuantityDefinition>
	) {
		if (!parser || typeof parser.parse !== "function")
		{
			throw new Error("A parser is required; use a configured Quantity entry point");
		}

		this.tokenMapper = UnitTokenManager.instance;
		this.parser = parser;

		// Classify object inputs here; scalar and unit validation below avoids
		// running the public definition guard and normalization twice.
		const definitionInput = initValue !== null && typeof initValue === 'object' && 'scalar' in initValue;

		if (definitionInput)
		{
			const definition = initValue as QuantityDefinition;
			this.#scalar = definition.scalar;
			this.#numerator = normalizePowers(definition.numerator);
			this.#denominator = normalizePowers(definition.denominator);
		}
		else
		{
			let parserResult: QuantityDefinition;

			if (initUnits)
			{
				parserResult = { ...this.parser.parse(initUnits, this.decimal), scalar: new this.decimal(scalarInput(initValue)) };
			}
			else if(typeof initValue === 'string')
			{
				parserResult = this.parser.parse(initValue, this.decimal);
			}
			else
			{
				parserResult = { scalar: new this.decimal(scalarInput(initValue)), numerator: UNITY, denominator: UNITY };
			}

			this.#scalar = parserResult.scalar;
			this.#numerator = normalizePowers(parserResult.numerator);
			this.#denominator = normalizePowers(parserResult.denominator);
		}

		if (!(this.scalar instanceof Decimal))
		{
			throw new TypeError('Quantity scalar must be a Decimal');
		}

		if (this.decimal !== Decimal && this.scalar.constructor !== this.decimal)
		{
			this.#scalar = new this.decimal(this.scalar);
		}

		this.#initValue = definitionInput
			? Object.freeze({ scalar: this.scalar, numerator: this.numerator, denominator: this.denominator })
			: typeof initValue === 'object' && !(initValue instanceof Decimal) ? this.scalar : initValue;

		// math with temperatures is very limited
		if (this.denominator.some(term => term.unit.startsWith("<temp-")))
		{
			throw new Error("Cannot divide with temperatures");
		}

		if (this.numerator.some(term => term.unit.startsWith("<temp-")))
		{
			if (this.numerator.length > 1 || this.numerator[0].exponent !== 1 || this.numerator[0].prefix !== undefined)
			{
				throw new Error("Cannot multiply by temperatures");
			}

			if (this.denominator.length !== 0)
			{
				throw new Error("Cannot divide with temperatures");
			}
		}

		// Validate dimensions now, without evaluating any numerical conversion factors.
		this.#signature = this.isBase() ? unitSignature(this)
			: this.isTemperature() ? TEMPERATURE_SIGNATURE : this.getBaseUnits().signature;

		if (this.isTemperature() && isBelowAbsoluteZero(this))
		{
			throw new Error("Temperatures must not be less than absolute zero");
		}
	}

	/** @internal Construct an operand or result with this instance's parser and class. */
	createQuantity(input: QuantityInitParam, units?: string): Quantity
	{
		return this.constructQuantity(input, units, this.parser);
	}

	/**
	 * Construct a derived quantity or temporary operand using this instance's context.
	 * @param input - Scalar, expression, definition or existing quantity to construct.
	 * @param units - Optional units; forward unchanged, including when input is numeric.
	 * @param parser - The originating instance's parser, including an explicit override.
	 * @returns A new quantity of the current configured class.
	 * @remarks The default calls `new this.constructor(input, units, parser)`.
	 * Subclasses whose constructors need additional arguments must override this hook
	 * and supply them. Use `this.constructor` to preserve classes returned by
	 * `withConfig()`, and forward input, units and parser without reparsing or converting
	 * them. The hook also constructs string operands and conversion targets, so input
	 * must accept every `QuantityInitParam` form, not only result definitions.
	 * @category Advanced
	 */
	protected constructQuantity(input: QuantityInitParam, units: string | undefined, parser: Parser<QuantityDefinition>): Quantity
	{
		const Constructor = this.constructor as new (
			input: QuantityInitParam, units: string | undefined, parser: Parser<QuantityDefinition>
		) => Quantity;

		return new Constructor(input, units, parser);
	}

	/**
	 * Create a new quantity with the same value and units.
	 * @returns A distinct Quantity instance with its own conversion cache.
	 * @remarks The scalar and frozen unit arrays are reused, preserving the configured parser.
	 * Treat the original and copy as immutable.
	 * @example
	 * ```ts
	 * const original = new Quantity('2 m');
	 * const copy = original.clone();
	 * copy === original; // false
	 * copy.same(original); // true
	 * ```
	 * @category Construction
	 */
	clone(): Quantity
	{
		return this.createQuantity(this);
	}

	//
	// Mathematical operations on quantities
	//
	/**
	 * Add a quantity after converting it to compatible units.
	 * @param other - A quantity expression, definition, Quantity, or scalar input. Scalars
	 * without units are dimensionless and require a compatible receiver.
	 * @returns A new quantity, normally in this quantity's units. Adding degrees to an
	 * absolute temperature returns an absolute temperature.
	 * @throws If units are incompatible, the input is invalid, two absolute temperatures
	 * are added, or the result is below absolute zero.
	 * @example
	 * ```ts
	 * new Quantity('1 m').add('25 cm').scalar.toString(); // "1.25"
	 * ```
	 * @category Arithmetic
	 */
	add(other: QuantityInitParam) : Quantity
	{
		return add(this, other);
	}
	/**
	 * Subtract a quantity after converting it to compatible units.
	 * @param other - A quantity expression, definition, Quantity, or scalar input. Scalars
	 * without units are dimensionless and require a compatible receiver.
	 * @returns A new quantity in this quantity's units, except that subtracting two
	 * absolute temperatures returns temperature degrees.
	 * @throws If units are incompatible, the input is invalid, an absolute temperature
	 * is subtracted from degrees, or the result is below absolute zero.
	 * @example
	 * ```ts
	 * new Quantity('1 m').sub('25 cm').scalar.toString(); // "0.75"
	 * new Quantity('30 tempC').sub('20 tempC').units(); // "degC"
	 * ```
	 * @category Arithmetic
	 */
	sub(other: QuantityInitParam) : Quantity
	{
		return sub(this, other);
	}
	/**
	 * Multiply by a scalar or combine units with another quantity.
	 * @param other - A number, Decimal, numeric `toString()` object, quantity expression, definition, or Quantity.
	 * @returns A new product. Scalars and quantities without unit tokens preserve the
	 * other operand's units. Compatible
	 * quantities are converted to the left operand's units before multiplication,
	 * except for temperature degrees.
	 * @throws If parsing fails, absolute temperatures are multiplied by a value with
	 * units, or the result is an invalid absolute temperature.
	 * @example
	 * ```ts
	 * new Quantity('3 m').mul(2).scalar.toString(); // "6"
	 * new Quantity('3 m').mul('2 m').units(); // "m2"
	 * ```
	 * @category Arithmetic
	 */
	mul(other: QuantityInitParam) : Quantity
	{
		return mul(this, other);
	}
	/**
	 * Divide by a scalar or combine units with another quantity.
	 * @param other - A number, Decimal, numeric `toString()` object, quantity expression, definition, or Quantity.
	 * @returns A new quotient. Divisors without unit tokens preserve the current units,
	 * including numeric strings and dimensionless Quantity instances. Compatible
	 * quantities are converted before division, except for temperature degrees.
	 * @throws If parsing fails, the divisor is an absolute temperature, or an absolute
	 * temperature is divided by a value with units.
	 * @remarks Validate zero divisors when accepting user input; this method delegates
	 * scalar division to Decimal rather than explicitly rejecting zero.
	 * @example
	 * ```ts
	 * new Quantity('100 km').div('2 h').scalar.toString(); // "50"
	 * new Quantity('1 m').div('25 cm').isUnitless(); // true
	 * ```
	 * @category Arithmetic
	 */
	div(other: QuantityInitParam) : Quantity
	{
		return div(this, other);
	}
	/**
	 * Raise the scalar and units to an integer power.
	 * @param yy - Integer exponent as a number, decimal string, or Decimal. Negative
	 * exponents invert the unit expression.
	 * @returns A new quantity with the powered scalar and units.
	 * @throws If the exponent is fractional or invalid, or the resulting units violate
	 * absolute-temperature restrictions. Exponents and resulting counts outside the
	 * safe-integer range throw RangeError.
	 * @remarks Exponent zero returns the dimensionless identity, with scalar one.
	 * Units are stored as counters; powers never allocate repeated unit entries.
	 * Exponent validation is independent of the quantity's Decimal range settings;
	 * those settings apply to the resulting scalar.
	 * @example
	 * ```ts
	 * new Quantity('3 m').pow(2).scalar.toString(); // "9"
	 * new Quantity('3 m').pow(2).units(); // "m2"
	 * ```
	 * @category Arithmetic
	 */
	pow(yy: number | string | Decimal) : Quantity
	{
		return pow(this, yy);
	}
	/**
	 * Take the reciprocal of the scalar and swap numerator and denominator units.
	 * @returns A new reciprocal quantity.
	 * @throws If the scalar is zero or this is an absolute temperature.
	 * @example
	 * ```ts
	 * new Quantity('2 m').inverse().scalar.toString(); // "0.5"
	 * new Quantity('2 m').inverse().units(); // "1/m"
	 * ```
	 * @category Arithmetic
	 */
	inverse() : Quantity
	{
		return inverse(this);
	}

	//
	// Quantity comparison functions
	//
	/**
	 * Test whether this physical value is equal to another compatible value.
	 * @param b - Quantity or expression, or a number/Decimal in this quantity's current units.
	 * @returns Whether the comparison holds. Numeric operands compare directly with the scalar;
	 * Quantity and string operands compare compatible physical values. NaN returns false.
	 * @throws If the expression is invalid or units are incompatible.
	 * @example
	 * ```ts
	 * new Quantity('1 m').eq('100 cm'); // true
	 * ```
	 * @see {@link compareTo} for three-way comparison.
	 * @category Comparison
	 */
	eq(b: string | number | Decimal | Quantity): boolean
	{
		return eq(this, b);
	}
	/**
	 * Test whether this physical value is less than another compatible value.
	 * @param b - Quantity or expression, or a number/Decimal in this quantity's current units.
	 * @returns Whether the comparison holds. Numeric operands compare directly with the scalar;
	 * Quantity and string operands compare compatible physical values. NaN returns false.
	 * @throws If the expression is invalid or units are incompatible.
	 * @example
	 * ```ts
	 * new Quantity('1 m').lt('2 m'); // true
	 * ```
	 * @see {@link compareTo} for three-way comparison.
	 * @category Comparison
	 */
	lt(b: string | number | Decimal | Quantity): boolean
	{
		return lt(this, b);
	}
	/**
	 * Test whether this physical value is less than or equal to another compatible value.
	 * @param b - Quantity or expression, or a number/Decimal in this quantity's current units.
	 * @returns Whether the comparison holds. Numeric operands compare directly with the scalar;
	 * Quantity and string operands compare compatible physical values. NaN returns false.
	 * @throws If the expression is invalid or units are incompatible.
	 * @example
	 * ```ts
	 * new Quantity('1 m').lte('100 cm'); // true
	 * ```
	 * @see {@link compareTo} for three-way comparison.
	 * @category Comparison
	 */
	lte(b: string | number | Decimal | Quantity): boolean
	{
		return lte(this, b);
	}
	/**
	 * Test whether this physical value is greater than another compatible value.
	 * @param b - Quantity or expression, or a number/Decimal in this quantity's current units.
	 * @returns Whether the comparison holds. Numeric operands compare directly with the scalar;
	 * Quantity and string operands compare compatible physical values. NaN returns false.
	 * @throws If the expression is invalid or units are incompatible.
	 * @example
	 * ```ts
	 * new Quantity('1 m').gt('50 cm'); // true
	 * ```
	 * @see {@link compareTo} for three-way comparison.
	 * @category Comparison
	 */
	gt(b: string | number | Decimal | Quantity): boolean
	{
		return gt(this, b);
	}
	/**
	 * Test whether this physical value is greater than or equal to another compatible value.
	 * @param b - Quantity or expression, or a number/Decimal in this quantity's current units.
	 * @returns Whether the comparison holds. Numeric operands compare directly with the scalar;
	 * Quantity and string operands compare compatible physical values. NaN returns false.
	 * @throws If the expression is invalid or units are incompatible.
	 * @example
	 * ```ts
	 * new Quantity('1 m').gte('100 cm'); // true
	 * ```
	 * @see {@link compareTo} for three-way comparison.
	 * @category Comparison
	 */
	gte(b: string | number | Decimal | Quantity): boolean
	{
		return gte(this, b);
	}
	/**
	 * Test exact scalar equality and matching normalized unit records.
	 * @param b - Quantity to compare with this instance.
	 * @returns Whether scalars and ordered unit/prefix/exponent records match. Different compatible
	 * units return false even when they represent the same physical value.
	 * @example
	 * ```ts
	 * const length = new Quantity('1 m');
	 * length.same(new Quantity('100 cm')); // false
	 * length.eq('100 cm'); // true
	 * ```
	 * @category Comparison
	 */
	same(b: Quantity): boolean
	{
		return same(this, b);
	}
	/**
	 * Compare compatible physical values, or a numeric value in the current units.
	 * @param b - Quantity or quantity expression, or a number/Decimal in this quantity's
	 * current units. Numeric operands require no parsing or temporary Quantity.
	 * @returns `-1` if this quantity is smaller, `0` if equal, or `1` if larger;
	 * `undefined` when either value is NaN. Boolean comparisons return false for NaN.
	 * @throws If the expression is invalid or the units are incompatible. Reciprocal
	 * units are not comparable; convert them explicitly first if appropriate.
	 * @example
	 * ```ts
	 * new Quantity('1 m').compareTo('50 cm'); // 1
	 * new Quantity('1 m').compareTo('100 cm'); // 0
	 * new Quantity('10 m').compareTo(5); // 1 (10 m compared with 5 m)
	 * ```
	 * @category Comparison
	 */
	compareTo(b: string | number | Decimal | Quantity): -1 | 0 | 1 | undefined
	{
		return compareTo(this, b);
	}
	/**
	 * Test whether another quantity has reciprocal dimensions.
	 * @param b - A Quantity or expression describing the reciprocal units.
	 * @returns Whether all dimensional exponents are the negatives of those in `b`.
	 * Scalars are ignored, including zero. Absolute temperatures and temperature
	 * degrees share a dimension; this check does not imply that inversion is allowed.
	 * @throws If a string cannot be parsed.
	 * @remarks Existing Quantity operands require no parsing or temporary quantities.
	 * Actual reciprocal conversion still rejects zero values and absolute temperatures.
	 * @example
	 * ```ts
	 * new Quantity('2 m').isInverse('m^-1'); // true
	 * new Quantity('0 m').isInverse('m^-1'); // true
	 * ```
	 * @category Comparison
	 */
	isInverse(b: string | Quantity) : boolean
	{
		return isInverse(this,b);
	}
	/**
	 * Test whether two quantities have the same dimensional signature.
	 * @param b - A Quantity or unit expression; numeric inputs return false.
	 * @returns Whether dimensions match, without comparing scalars or converting units.
	 * Absolute temperatures and temperature degrees share a signature.
	 * @throws If a string cannot be parsed.
	 * @example
	 * ```ts
	 * const length = new Quantity('1 m');
	 * length.isCompatible('cm'); // true
	 * length.isCompatible('s'); // false
	 * ```
	 * @category Comparison
	 */
	isCompatible(b: string | number | Quantity) : boolean
	{
		return isCompatible(this, b);
	}
	/**
	 * Test whether the normalized numerator and denominator are both unity.
	 * @returns True for a quantity without unit tokens. Named dimensionless units such
	 * as radians and `each` return false.
	 * @example
	 * ```ts
	 * new Quantity('2').isUnitless(); // true
	 * new Quantity('2 rad').isUnitless(); // false
	 * ```
	 * @category Comparison
	 */
	isUnitless() : boolean
	{
		return isUnitless(this);
	}

	//
	// Temperature handling functions
	//
	/**
	 * Test whether this quantity represents an absolute temperature.
	 * @returns True for standalone `tempC`, `tempF`, `tempK`, or `tempR` units.
	 * @example
	 * ```ts
	 * new Quantity('20 tempC').isTemperature(); // true
	 * new Quantity('20 degC').isTemperature(); // false
	 * ```
	 * @category Temperature
	 */
	public isTemperature() : boolean
	{
		return isTemperature(this);
	}

	/**
	 * Test for a standalone, unprefixed temperature unit, including absolute temperatures.
	 * @returns True for both `degC`-style intervals and `tempC`-style absolute temperatures.
	 * To identify an unprefixed interval, combine this with `!qty.isTemperature()`.
	 * Prefixed and compound interval units return false; use `isCompatible('degK')`
	 * for a dimensional check.
	 * @example
	 * ```ts
	 * new Quantity('20 degC').isDegrees(); // true
	 * new Quantity('20 tempC').isDegrees(); // true
	 * new Quantity('20 degC/m').isDegrees(); // false
	 * ```
	 * @see {@link isTemperature}
	 * @category Temperature
	 */
	public isDegrees() : boolean
	{
		return isDegrees(this);
	}

	/**
	 * Convert to compatible units, or reciprocal units by inverting the quantity.
	 * @param other - Target unit expression or Quantity. Only the units are used;
	 * any target scalar is ignored, including zero or negative values.
	 * @returns The quantity expressed in the target units. Empty target strings and
	 * unchanged units return this instance; repeated conversions can return cached objects.
	 * @throws If parsing fails, dimensions are neither compatible nor reciprocal, or
	 * reciprocal conversion requires inverting a zero value or absolute temperature.
	 * @example
	 * ```ts
	 * const mass = new Quantity('25 kg');
	 * mass.to('g').scalar.toString(); // "25000"
	 * mass.to(new Quantity('3 g')).scalar.toString(); // "25000"
	 * new Quantity('2 m').to('m^-1').scalar.toString(); // "0.5"
	 * ```
	 * @see {@link toBase}
	 * @category Conversion
	 */
	to(other: string | Quantity) : Quantity
	{
		this.refreshNumericConfiguration();

		if (!other)
		{
			return this;
		}

		if (isString(other))
		{
			const expression = other as string;
			const cachedKey = this.conversionExpressionCache?.get(expression);

			if (cachedKey === null)
			{
				return this;
			}

			const cached = cachedKey === undefined ? undefined : this.conversionCache?.get(cachedKey);

			if (cached)
			{
				return cached;
			}

			// Replace the parsed scalar before construction validates the target value.
			const target = this.createQuantity(1, expression);
			const key = unitKey(target);
			const result = this.cachedConversion(target, key);

			// Identity expressions need only a marker, not a retained result. Other
			// aliases are kept only when their result fits the result cache budget.
			if (result === this || this.conversionCache?.has(key))
			{
				(this.conversionExpressionCache ??= BudgetCache.create(this.conversionCacheConfig,
					conversionExpressionPolicy))?.set(expression, result === this ? null : key);
			}

			return result;
		}

		const quantity = other as Quantity;

		if (sameUnits(quantity, this))
		{
			return this;
		}

		// A Quantity target supplies units only, including when its scalar is zero.
		// All target forms use the bounded result cache; a WeakMap of live target
		// objects must not keep evicted or oversized results alive separately.
		return this.cachedConversion(quantity, unitKey(quantity));
	}

	private cachedConversion(target: Quantity, key: string): Quantity
	{
		const cached = this.conversionCache?.get(key);

		if (cached)
		{
			return cached;
		}

		const result = this.convertToUnits(target);

		if (result !== this)
		{
			(this.conversionCache ??= BudgetCache.create(this.conversionCacheConfig,
				conversionResultPolicy))?.set(key, result);
		}

		return result;
	}

	private convertToUnits(target: Quantity): Quantity
	{
		if (sameUnits(target, this))
		{
			return this;
		}

		if (!this.isCompatible(target))
		{
			if (!this.isInverse(target))
			{
				throwIncompatibleUnits();
			}

			if (this.isTemperature())
			{
				throw new Error('Cannot divide with temperatures');
			}

			if (target.isTemperature())
			{
				return toTemp(this, target, true);
			}

			return this.createQuantity({
				scalar: resolveReciprocal(this, target, this.decimal),
				numerator: target.numerator,
				denominator: target.denominator
			});
		}

		if (target.isTemperature())
		{
			return toTemp(this, target);
		}

		if (target.isDegrees())
		{
			return toDegrees(this, target);
		}

		return this.createQuantity({
			scalar: resolveUnitValue(this, target, this.decimal),
			numerator: target.numerator,
			denominator: target.denominator
		});
	}

	//
	// Convert to base SI units and cache the results for future performance
	//
	/**
	 * Convert this quantity to the library's base unit system.
	 * @returns A quantity in base units, or this instance if it already uses base units.
	 * Absolute temperatures are converted to `tempK` with the appropriate offset.
	 * @example
	 * ```ts
	 * new Quantity('250 cm').toBase().scalar.toString(); // "2.5"
	 * new Quantity('250 cm').toBase().units(); // "m"
	 * new Quantity('0 tempC').toBase().scalar.toString(); // "273.15"
	 * ```
	 * @category Conversion
	 */
	toBase() : Quantity
	{
		if (this.isBase())
		{
			return this;
		}

		if (this.isTemperature())
		{
			return toTempK(this);
		}

		const base = this.getBaseUnits();
		return this.createQuantity({
			scalar: this.baseScalar,
			numerator: base.numerator,
			denominator: base.denominator
		});
	}

	private getBaseUnits(): BaseUnitMetadata
	{
		if (this._baseUnits)
		{
			return this._baseUnits;
		}

		const cache = Quantity.baseUnitCache;
		const key = unitKey(this);
		let cached = cache.get(key);

		if (!cached)
		{
			cached = this.resolveBaseUnits(this.numerator, this.denominator);
			cache.set(key, cached);
		}

		return this._baseUnits = cached;
	}

	/**
	 * Test whether every unprefixed unit belongs to the library's base unit set.
	 * @returns True for base units or a unitless quantity; false for scaled or derived units.
	 * @example
	 * ```ts
	 * new Quantity('1 m').isBase(); // true
	 * new Quantity('1 cm').isBase(); // false
	 * ```
	 * @category Conversion
	 */
	isBase() : boolean
	{
		if (this._isBase !== undefined)
		{
			return this._isBase;
		}

		this._isBase = this.numerator.every(term => !term.prefix && Quantity.BASE_UNITS.includes(term.unit)) &&
			this.denominator.every(term => !term.prefix && Quantity.BASE_UNITS.includes(term.unit));

		return this._isBase;
	}

	/**
	 * Format the counted units as a unit expression.
	 * @returns The expression without its scalar; an empty string for a unitless quantity.
	 * @remarks Spelling and grouping may differ from the input. Powers use compact
	 * notation such as `m2`; numerator multiplication uses `*` and denominator
	 * multiplication uses tightly coupled `.`, as in `kg/m.s`. Output aliases preserve
	 * unit identity when parsed by either bundled parser. The result is cached.
	 * @example
	 * ```ts
	 * new Quantity('3 meter').units(); // "m"
	 * new Quantity('3 m^2').units(); // "m2"
	 * new Quantity('3 kg/m/s').units(); // "kg/m.s"
	 * new Quantity('3').units(); // ""
	 * ```
	 * @category Values
	 */
	units() : string
	{
		if (this._units !== undefined)
		{
			return this._units;
		}

		let numIsUnity = this.numerator.length === 0,
			denIsUnity = this.denominator.length === 0;

		if (numIsUnity && denIsUnity)
		{
			this._units = "";
			return this._units;
		}

		let numUnits = this.stringifyUnits(this.numerator),
			denUnits = this.stringifyUnits(this.denominator, '.');

		this._units = numUnits + (denIsUnity ? "" : ("/" + denUnits));

		return this._units;
	}

	private resolveBaseUnits(numerator: readonly UnitPower[], denominator: readonly UnitPower[]): BaseUnitMetadata
	{
		const num: UnitPower[] = [], den: UnitPower[] = [];
		numerator = normalizePowers(numerator);
		denominator = normalizePowers(denominator);
		const append = (tokens: string[] | null | undefined, exponent: number, target: UnitPower[]) => {
			// Catalog definitions have a fixed, small number of base tokens. User
			// exponents multiply counts; they never determine an array's length.
			for (const unit of tokens ?? [])
			{
				if (unit !== '<1>')
				{
					target.push({ unit, exponent });
				}
			}
		};
		const accumulate = (terms: readonly UnitPower[], inverse: boolean) => {
			for (const { unit: token, exponent } of terms)
			{
				// normalizePowers has validated these catalog tokens.
				const unit = this.tokenMapper.getUnit(token)!;
				append(unit.numerator, exponent, inverse ? den : num);
				append(unit.denominator, exponent, inverse ? num : den);
			}
		};
		accumulate(numerator, false);
		accumulate(denominator, true);
		const [baseNum, baseDen] = cancelPowers(num, den);

		return Object.freeze({
			numerator: baseNum,
			denominator: baseDen,
			signature: unitSignature({ numerator: baseNum, denominator: baseDen })
		});
	}

	private refreshNumericConfiguration(): void
	{
		if (this.numericConfiguration === this.decimal.config) return;

		this.numericConfiguration = this.decimal.config;
		this._baseScalar = undefined;
		this.conversionCache = undefined;
		this.conversionExpressionCache = undefined;
	}

	private updateBaseScalar(): Decimal
	{
		this.refreshNumericConfiguration();

		if (this._baseScalar !== undefined)
		{
			return this._baseScalar;
		}

		if (this.isBase())
		{
			this._baseScalar = this.scalar;
		}
		else if (this.isTemperature())
		{
			this._baseScalar = temperatureBaseScalar(this.scalar, this.numerator[0].unit, this.decimal);
		}
		else
		{
			this._baseScalar = resolveUnitValue(this, undefined, this.decimal);
		}

		return this._baseScalar;
	};

	//
	// Returns a string representing a normalized unit array and caches the result
	//
	// @param units Frozen array of counted unit records
	// @returns {string} String representing passed normalized unit array and suitable for output
	//
	private stringifyUnits(units: readonly UnitPower[], separator: '*' | '.' = '*'): string
	{
		const cache = separator === '*' ? Quantity.stringifiedUnitsCache : Quantity.stringifiedDenominatorCache;
		let stringified = cache.get(units);

		if (stringified && typeof stringified === 'string')
		{
			return stringified;
		}
		else
		{
			stringified = stringifyUnits(units, separator);

			// Cache result
			cache.set(units, stringified);

			return stringified;
		}
	}
}
