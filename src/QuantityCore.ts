/*!
Copyright © 2006-2007 Kevin C. Olbrich
Copyright © 2010-2013 LIM SAS (http://lim.eu) - Julien Sanchez
Copyright © 2016-2025 Native Dynamics (nativedynamics.com.au) - Trevor Walker

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import { NestedMap, typeguards, compareArray } from "@neutrium/utilities";
import { Decimal } from '@neutrium/decimal';

import type { QuantityDefinition } from './QuantityDefinition.js'
import { isQuantityDefinition } from './guards.js';
import type { QuantityInitParam } from './guards.js'

import type { Parser } from './parsers/Parser.js'
import { UnitTokenManager } from "./UnitTokenManager.js";

// Import operators
import { add, sub, mul, div, pow, inverse } from './operations/maths.js'
import { isDegrees, isTemperature, toDegrees, toTemp, toTempK } from "./operations/temperature.js";
import { compareTo, eq, gt, gte, isCompatible, isInverse, isUnitless, lt, lte, same } from './operations/comparison.js';
import { throwIncompatibleUnits } from "./operations/errors.js";
import { unitSignature } from './operations/unit-signatures.js'
import { stringifyUnits } from './operations/unit-strings.js';

const isString = typeguards.isString;

/**
 * A decimal scalar paired with units, with conversion, arithmetic, and comparison operations.
 *
 * Import from `@neutrium/quantity`. Construct quantities with `new` and read the
 * numerical result through {@link scalar}; {@link units} returns the unit expression.
 *
 * @remarks
 * Arithmetic produces quantities without changing the operands. Conversions may
 * return the same instance or a cached result. Treat quantities and their token
 * arrays as immutable: assigning to public fields does not refresh derived values
 * or conversion caches. {@link clone} is not a deep copy of the token arrays.
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
	private static BASE_UNITS = ["<meter>", "<kilogram>", "<second>", "<mole>", "<farad>", "<ampere>", "<radian>", "<kelvin>", "<temp-K>", "<byte>", "<dollar>", "<candela>", "<each>", "<steradian>", "<bel>"];
	private static UNITY = "<1>";
	private static UNITY_ARRAY = [Quantity.UNITY];

	private static baseUnitCache: Record<string, QuantityDefinition> = {};
	private static stringifiedUnitsCache = new NestedMap();
	private conversionCache = new Map<string, Quantity>();
	private quantityConversionCache = new WeakMap<Quantity, Quantity>();

	private parser: Parser<QuantityDefinition>;

	// Instance variables
	/**
	 * The original constructor input, retained by reference for object inputs.
	 * @category Values
	 */
	initValue: any;
	/**
	 * Numerical value in this quantity's units, stored as `@neutrium/decimal` Decimal.
	 *
	 * Use `scalar.toString()` to retain decimal digits, or `scalar.toNumber()` when a
	 * JavaScript number is needed and floating-point rounding is acceptable.
	 * Do not reassign this field; create a new quantity to change the value.
	 * @category Values
	 */
	scalar: Decimal;
	/**
	 * Normalized numerator tokens, such as `["<meter>"]`. Treat this array as read-only.
	 * @see {@link units} for a human-readable expression.
	 * @category Values
	 */
	numerator = Quantity.UNITY_ARRAY;
	/**
	 * Normalized denominator tokens; `["<1>"]` represents unity. Treat this array as read-only.
	 * @see {@link units} for a human-readable expression.
	 * @category Values
	 */
	denominator = Quantity.UNITY_ARRAY;
	/**
	 * Cached numerical value in base units; absolute temperatures use kelvin.
	 * @see {@link toBase} for a quantity with base units and this value.
	 * @category Values
	 */
	baseScalar: Decimal;
	/**
	 * Cached dimensional signature. Prefer {@link isCompatible} over interpreting this number.
	 * @category Values
	 */
	signature: number = null;
	private _isBase: boolean;
	private _units: string;
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
	 * Bare numbers and Decimal instances require `initUnits`. Use a string such as
	 * `"2"` for a unitless quantity; `new Quantity(2)` is not supported. Use a decimal
	 * string when preserving all input digits matters.
	 *
	 * @example
	 * ```ts
	 * const length = new Quantity('1.25', 'm');
	 * const unit = new Quantity('m'); // scalar defaults to 1
	 * const ratio = new Quantity('2'); // unitless
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

		if (isQuantityDefinition(initValue))
		{
			this.scalar = initValue.scalar;
			this.numerator = (initValue.numerator && initValue.numerator.length !== 0) ? initValue.numerator : Quantity.UNITY_ARRAY;
			this.denominator = (initValue.denominator && initValue.denominator.length !== 0) ? initValue.denominator : Quantity.UNITY_ARRAY;
		}
		else
		{
			let parserResult: any = {};

			if (initUnits)	// Todo type guard properly
			{
				parserResult = { ...this.parser.parse(initUnits), scalar: new Decimal(initValue) };
			}
			else if(typeof initValue === 'string')
			{
				parserResult = this.parser.parse(initValue);
			}
			else
			{
				throw new Error("Parameters do not match accpeted types");
			}

			this.scalar = parserResult.scalar;
			this.numerator = parserResult.numerator;
			this.denominator = parserResult.denominator;
		}

		// math with temperatures is very limited
		if (this.denominator.join("*").indexOf("temp") >= 0)
		{
			throw new Error("Cannot divide with temperatures");
		}

		if (this.numerator.join("*").indexOf("temp") >= 0)
		{
			if (this.numerator.length > 1)
			{
				throw new Error("Cannot multiply by temperatures");
			}

			if (!compareArray(this.denominator, Quantity.UNITY_ARRAY))
			{
				throw new Error("Cannot divide with temperatures");
			}
		}

		this.initValue = initValue;
		this.updateBaseScalar();

		if (this.isTemperature() && this.baseScalar.lt(0))
		{
			throw new Error("Temperatures must not be less than absolute zero");
		}
	}

	/** @internal Construct an operand or result with this instance's parser and class. */
	createQuantity(input: QuantityInitParam, units?: string): Quantity
	{
		const Constructor = this.constructor as new (
			input: QuantityInitParam, units: string | undefined, parser: Parser<QuantityDefinition>
		) => Quantity;
		return new Constructor(input, units, this.parser);
	}

	/**
	 * Create a new quantity with the same value and units.
	 * @returns A distinct Quantity instance with its own conversion cache.
	 * @remarks The scalar and unit arrays are reused; this is not a deep copy and preserves
	 * the configured parser. Treat the original and copy as immutable.
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
	 * @param other - A quantity expression, definition, or Quantity. Bare numbers and
	 * Decimal instances are not supported here; use a string for unitless values.
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
	 * @param other - A quantity expression, definition, or Quantity. For unitless values,
	 * use a string rather than a bare number or Decimal.
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
	 * @param other - A number, Decimal, quantity expression, definition, or Quantity.
	 * @returns A new product. Numeric scalars preserve the current units. Compatible
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
	 * @param other - A number, Decimal, quantity expression, definition, or Quantity.
	 * @returns A new quotient. Numeric scalars preserve the current units. Compatible
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
	 * absolute-temperature restrictions.
	 * @remarks Exponent zero returns the dimensionless identity, with scalar one.
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
	 * @param b - Quantity or expression. Use a string rather than a bare number for unitless values.
	 * @returns Whether the comparison holds after conversion to base units.
	 * @throws If the expression is invalid or units are incompatible.
	 * @example
	 * ```ts
	 * new Quantity('1 m').eq('100 cm'); // true
	 * ```
	 * @see {@link compareTo} for three-way comparison.
	 * @category Comparison
	 */
	eq(b: string | number | Quantity): boolean
	{
		return eq(this, b);
	}
	/**
	 * Test whether this physical value is less than another compatible value.
	 * @param b - Quantity or expression. Use a string rather than a bare number for unitless values.
	 * @returns Whether the comparison holds after conversion to base units.
	 * @throws If the expression is invalid or units are incompatible.
	 * @example
	 * ```ts
	 * new Quantity('1 m').lt('2 m'); // true
	 * ```
	 * @see {@link compareTo} for three-way comparison.
	 * @category Comparison
	 */
	lt(b: string | number | Quantity): boolean
	{
		return lt(this, b);
	}
	/**
	 * Test whether this physical value is less than or equal to another compatible value.
	 * @param b - Quantity or expression. Use a string rather than a bare number for unitless values.
	 * @returns Whether the comparison holds after conversion to base units.
	 * @throws If the expression is invalid or units are incompatible.
	 * @example
	 * ```ts
	 * new Quantity('1 m').lte('100 cm'); // true
	 * ```
	 * @see {@link compareTo} for three-way comparison.
	 * @category Comparison
	 */
	lte(b: string | number | Quantity): boolean
	{
		return lte(this, b);
	}
	/**
	 * Test whether this physical value is greater than another compatible value.
	 * @param b - Quantity or expression. Use a string rather than a bare number for unitless values.
	 * @returns Whether the comparison holds after conversion to base units.
	 * @throws If the expression is invalid or units are incompatible.
	 * @example
	 * ```ts
	 * new Quantity('1 m').gt('50 cm'); // true
	 * ```
	 * @see {@link compareTo} for three-way comparison.
	 * @category Comparison
	 */
	gt(b: string | number | Quantity): boolean
	{
		return gt(this, b);
	}
	/**
	 * Test whether this physical value is greater than or equal to another compatible value.
	 * @param b - Quantity or expression. Use a string rather than a bare number for unitless values.
	 * @returns Whether the comparison holds after conversion to base units.
	 * @throws If the expression is invalid or units are incompatible.
	 * @example
	 * ```ts
	 * new Quantity('1 m').gte('100 cm'); // true
	 * ```
	 * @see {@link compareTo} for three-way comparison.
	 * @category Comparison
	 */
	gte(b: string | number | Quantity): boolean
	{
		return gte(this, b);
	}
	/**
	 * Test exact scalar equality and matching normalized unit strings.
	 * @param b - Quantity to compare with this instance.
	 * @returns Whether both scalar and unit expression match. Different compatible
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
	 * Compare physical values after conversion to base units.
	 * @param b - Quantity or quantity expression. Although the signature includes
	 * numbers, bare numeric inputs are not supported; use strings for unitless values.
	 * @returns `-1` if this quantity is smaller, `0` if equal, or `1` if larger.
	 * @throws If the expression is invalid or the units are incompatible. Reciprocal
	 * units are not comparable; convert them explicitly first if appropriate.
	 * @example
	 * ```ts
	 * new Quantity('1 m').compareTo('50 cm'); // 1
	 * new Quantity('1 m').compareTo('100 cm'); // 0
	 * ```
	 * @category Comparison
	 */
	compareTo(b: string | number | Quantity): number
	{
		return compareTo(this, b);
	}
	/**
	 * Test whether another quantity has reciprocal dimensions.
	 * @param b - A Quantity or expression describing the reciprocal units.
	 * @returns Whether the inverse of this quantity is compatible with `b`.
	 * @throws If this quantity has a zero scalar or is an absolute temperature, or `b`
	 * cannot be parsed. The check constructs a reciprocal internally.
	 * @example
	 * ```ts
	 * new Quantity('2 m').isInverse('m^-1'); // true
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
	 * Test for a standalone temperature unit, including absolute temperatures.
	 * @returns True for both `degC`-style intervals and `tempC`-style absolute temperatures.
	 * To identify an interval only, combine this with `!qty.isTemperature()`.
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
	 * @param other - Target unit expression or Quantity whose scalar is ignored. Use a
	 * units-only string such as `"cm"`; a scalar embedded in a string participates in
	 * conversion and is not handled like a Quantity argument.
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
		if (!other)
		{
			return this;
		}

		if (isString(other))
		{
			const expression = other as string;
			const cached = this.conversionCache.get(expression);
			if (cached) return cached;
			const result = this.convertToUnits(this.createQuantity(expression));
			this.conversionCache.set(expression, result);
			return result;
		}

		const quantity = other as Quantity;
		const cached = this.quantityConversionCache.get(quantity);

		if (cached)
		{
			return cached;
		}

		// A Quantity target supplies units only, including when its scalar is zero.
		const target = this.createQuantity({
			scalar: new Decimal(1),
			numerator: quantity.numerator,
			denominator: quantity.denominator
		});
		const result = this.convertToUnits(target);
		this.quantityConversionCache.set(quantity, result);

		return result;
	}

	private convertToUnits(target: Quantity): Quantity
	{
		if (target.units() === this.units())
		{
			return this;
		}

		if (!this.isCompatible(target))
		{
			if (!this.isInverse(target)) throwIncompatibleUnits();
			return this.inverse().convertToUnits(target);
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
			scalar: this.baseScalar.div(target.baseScalar),
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

		let cached = Quantity.baseUnitCache[this.units()];

		if (!cached)
		{
			cached = this.toBaseUnits(this.numerator, this.denominator);
			Quantity.baseUnitCache[this.units()] = {
				scalar: cached.scalar, numerator: cached.numerator, denominator: cached.denominator
			};
		}

		return this.createQuantity({
			scalar: cached.scalar.mul(this.scalar),
			numerator: cached.numerator,
			denominator: cached.denominator
		});
	}

	/**
	 * Test whether every unit token belongs to the library's base unit set.
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

		if (this.isDegrees() && this.numerator[0].match(/<(kelvin|temp-K)>/))
		{
			this._isBase = true;
			return this._isBase;
		}

		this.numerator.concat(this.denominator).forEach(function (item)
		{
			if (item !== Quantity.UNITY && Quantity.BASE_UNITS.indexOf(item) === -1)
			{
				this._isBase = false;
			}
		}, this);

		if (this._isBase === false)
		{
			return this._isBase;
		}

		this._isBase = true;

		return this._isBase;
	}

	/**
	 * Format the normalized unit tokens as a unit expression.
	 * @returns The expression without its scalar; an empty string for a unitless quantity.
	 * @remarks Spelling and grouping may differ from the input. Powers use compact
	 * notation such as `m2`; multiplication uses `*`. The result is cached.
	 * @example
	 * ```ts
	 * new Quantity('3 meter').units(); // "m"
	 * new Quantity('3 m^2').units(); // "m2"
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

		let numIsUnity = compareArray(this.numerator, Quantity.UNITY_ARRAY),
			denIsUnity = compareArray(this.denominator, Quantity.UNITY_ARRAY);

		if (numIsUnity && denIsUnity)
		{
			this._units = "";
			return this._units;
		}

		let numUnits = this.stringifyUnits(this.numerator),
			denUnits = this.stringifyUnits(this.denominator);

		this._units = numUnits + (denIsUnity ? "" : ("/" + denUnits));

		return this._units;
	}

	/**
	 * Expand normalized unit tokens into their base-unit conversion factor.
	 * @param numerator - Array of normalized numerator tokens, not display aliases.
	 * @param denominator - Array of normalized denominator tokens; `["<1>"]` means unity.
	 * @returns A quantity describing the supplied units in base units with their scale
	 * factor as its scalar. The current instance's scalar is not included.
	 * @remarks This is a low-level helper. Prefer {@link toBase} to convert an actual
	 * quantity, especially an absolute temperature that requires an offset.
	 * @category Advanced
	 */
	toBaseUnits(numerator, denominator)
	{
		let num = [],
			den = [],
			q = new Decimal(1),
			token;

		for (let i = 0; i < numerator.length; i++)
		{
			token = numerator[i];
			let unit = this.tokenMapper.getUnit(token);

			if (unit)
			{
				q = q.mul(unit.scalar);

				if (unit.numerator)
				{
					num.push(unit.numerator);
				}

				if (unit.denominator)
				{
					den.push(unit.denominator);
				}
			}
		}

		for (let j = 0; j < denominator.length; j++)
		{
			token = denominator[j];
			let unit = this.tokenMapper.getUnit(token);

			if (unit)
			{
				q = q.div(unit.scalar);

				if (unit.numerator)
				{
					den.push(unit.numerator);
				}

				if (unit.denominator)
				{
					num.push(unit.denominator);
				}
			}
		}

		// Flatten
		num = num.reduce((a, b) => a.concat(b), []);
		den = den.reduce((a, b) => a.concat(b), []);

		return this.createQuantity({
			scalar: q,
			numerator: num,
			denominator: den
		});
	}

	private updateBaseScalar() : void
	{
		if (this.baseScalar)
		{
			return;
		}

		if (this.isBase())
		{
			this.baseScalar = this.scalar;
			this.signature = unitSignature(this);
		}
		else
		{
			let base = this.toBase();
			this.baseScalar = base.scalar;
			this.signature = base.signature;
		}
	};

	//
	// Returns a string representing a normalized unit array and caches the result
	//
	// @param {string[]} units Normalized unit array
	// @returns {string} String representing passed normalized unit array and suitable for output
	//
	private stringifyUnits(units: string[]): string
	{
		let stringified: NestedMap | string = Quantity.stringifiedUnitsCache.get(units);

		if (stringified && typeof stringified === 'string')
		{
			return stringified;
		}
		else
		{
			stringified = stringifyUnits(units);

			// Cache result
			Quantity.stringifiedUnitsCache.set(units, stringified);

			return stringified;
		}
	}
}