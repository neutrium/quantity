import { assertKnownKeys } from '@neutrium/utilities/validation';
import { isConfigurableAdapter, type ConfigurableAdapter } from '@neutrium/utilities/numeric/helpers';
import { numericSettings, acceptsNumericOperand, convertNumericScalar } from './numeric/backend.js';
import { scalarFrom } from './numeric/support.js';
import { add, sub, mul, div, pow, inverse } from './operations/arithmetic.js';
import type { Decimal } from '@neutrium/decimal';
import type { ArithmeticAdapter } from '@neutrium/utilities/numeric/arithmetic';
import { compare, convert, base } from './operations/generic.js';
import { isDegrees, isTemperature, isBelowAbsoluteZero, ABSOLUTE_KELVIN_UNITS } from './operations/temperature.js';
import { areInverseSignatures } from './operations/unit-signatures.js';
import type { Parser } from './parsers/Parser.js';
import type { QuantityDefinition, UnitPower, UnitStructure } from './QuantityDefinition.js'
import { resolveQuantityCache, type QuantityConfigInput, type QuantityConfig } from './QuantityConfig.js';
import { CacheScope } from './utils/CacheScope.js';
import { DEFAULT_PARSER_CONFIG, parserConfig, type ParserConfig } from './parsers/ParserConfig.js';
import { throwIncompatibleUnits } from "./operations/errors.js";
import { unitSignature, TEMPERATURE_SIGNATURE } from './operations/unit-signatures.js'
import { formatUnits } from './operations/unit-strings.js';
import { basePowers, normalizePowers, UNITY } from './operations/unit-powers.js';
import { sameUnits, unitKey } from './operations/unit-identity.js';

import { LruCache } from '@neutrium/utilities/cache';
import type { CacheConfig } from '@neutrium/utilities/cache';
import { BudgetCache } from '@neutrium/utilities/cache';
import { conversionExpressionPolicy, conversionResultPolicy } from './operations/conversion-cache.js';

/**
 * Inputs accepted by a quantity using scalar type T.
 * Existing quantities may use another backend: construction converts their scalar
 * while preserving units. Arithmetic still requires compatible quantity backends.
 * Definitions must already contain a scalar native to the destination backend.
 */
export type QuantityInput<T> = string | number | T | (object & {
	/** Return a numeric literal to be validated by the selected adapter. */
	toString(): string;
}) | QuantityDefinition<T> | Quantity<unknown>;

const pendingInitValue = Symbol();

/** A result already evaluated by one adapter; other adapters must still adopt it. */
class QuantityResult<T> implements QuantityDefinition<T>
{
	readonly #scalar: T;
	readonly #numeric: ArithmeticAdapter<T>;
	get scalar(): T { return this.#scalar; }
	get numeric(): ArithmeticAdapter<T> { return this.#numeric; }
	constructor(
		scalar: T,
		readonly numerator: readonly UnitPower[],
		readonly denominator: readonly UnitPower[],
		numeric: ArithmeticAdapter<T>
	) {
		this.#scalar = scalar;
		this.#numeric = numeric;
	}
}

/** Base unit structure with its dimensional signature. */
interface BaseUnitMetadata extends UnitStructure
{
	readonly signature: string;
}

/** Validated structural data only; never retain a source quantity or its scalar. */
interface UnitMetadata
{
	readonly isBase: boolean;
	readonly signature: string;
	readonly baseUnits?: BaseUnitMetadata;
}

type UnitMetadataCache = WeakMap<readonly UnitPower[], WeakMap<readonly UnitPower[], UnitMetadata>>;

/**
 * A numeric scalar paired with units, with conversion, arithmetic, and comparison operations.
 *
 * Import from `@neutrium/quantity`. Construct quantities with `new` and read the
 * numerical result through {@link scalar}; {@link units} returns the unit expression.
 *
 * @remarks
 * Existing Quantity operands used for arithmetic or value comparisons must have
 * compatible numeric backends. Use `new DestinationQuantity(source)` to convert
 * explicitly. Dimensional predicates and conversion targets use units only.
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
 * @see {@link factory.Quantity.constructor | Creating quantities}
 * @see {@link factory.Quantity.to | Converting units}
 */
export abstract class Quantity<T = Decimal, Numeric extends object = object>
{
	private static BASE_UNITS = ["<meter>", "<kilogram>", "<second>", "<mole>", "<ampere>", "<radian>", "<kelvin>", "<temp-K>", "<byte>", "<dollar>", "<candela>", "<each>", "<steradian>", "<bel>"];

	// Structural metadata is independent of Decimal precision, rounding, and range.
	private static baseUnitKey = Symbol();
	private static structuralMetadataKey = Symbol();
	protected static cacheContext = new CacheScope();
	protected static resolvedConfig: QuantityConfig;
	// Options are checked by the public factory/preset types; this internal slot erases their shape.
	protected static numericAdapter: ArithmeticAdapter<any> & Partial<ConfigurableAdapter<ArithmeticAdapter<any>, object>>;
	protected static parserOptions: ParserConfig = DEFAULT_PARSER_CONFIG;
	private conversionCache?: BudgetCache<Quantity<T, Numeric>>;
	private conversionExpressionCache?: BudgetCache<string | null>;
	private _baseScalar?: T;
	private parser: Parser<T>;
	readonly #numeric: ArithmeticAdapter<T> = (this.constructor as typeof Quantity).numericAdapter;
	#initValue: QuantityInput<T> | typeof pendingInitValue;
	#scalar: T;
	#numerator = UNITY;
	#denominator = UNITY;
	#signature: string;
	private _isBase?: boolean;
	private _units?: string;
	private _baseUnits?: BaseUnitMetadata;

	/**
	 * Create a class with isolated numerical settings and optional cache limits.
	 * @param config - Nested `numeric` options and `cache` policies, merged with this class's settings.
	 * @returns A new class whose instances and derived results retain these settings.
	 * @remarks Subclasses with a different constructor signature must override the
	 * protected `constructQuantity` hook. Configuration preserves a constructor's
	 * signature; it does not supply additional subclass arguments to derived results.
	 * Numeric settings require a configurable adapter. Omitted settings inherit from
	 * this class; `cache: false` disables optional Quantity caches and `true` resets them.
	 * @example
	 * ```ts
	 * const Uncached = Quantity.withConfig({ cache: false });
	 * const q = new Uncached('2 m');
	 * q.config === Uncached.config; // true
	 * ```
	 * @category Construction
	 */
	static withConfig<C extends new (...args: never[]) => Quantity<any>>(this: C, config: QuantityConfigInput<object>): C
	{
		if (!config || typeof config !== 'object' || Array.isArray(config))
		{
			throw new TypeError('Expected Quantity configuration object');
		}

		const Base = this as unknown as typeof Quantity;
		assertKnownKeys(config as unknown, ['numeric', 'cache'], 'Quantity config');
		const numericOptions = config.numeric;

		if (numericOptions !== undefined && (!numericOptions || typeof numericOptions !== 'object' || Array.isArray(numericOptions)))
		{
			throw new TypeError('numeric must be a configuration object');
		}

		const policy = resolveQuantityCache(config.cache, Base.cacheContext.config);
		const scope = config.cache === undefined ? Base.cacheContext : new CacheScope(policy);
		const options = config.cache === undefined ? Base.parserOptions : parserConfig({ cache: policy.parser });
		class ConfiguredQuantity extends Base {}

		if (!Base.numericAdapter)
		{
			throw new Error('A numeric adapter is required');
		}

		let numeric = Base.numericAdapter;

		if (numericOptions !== undefined)
		{
			if (isConfigurableAdapter(numeric))
			{
				numeric = numeric.withConfig(numericOptions);
			}
			else if (Object.keys(numericOptions).length)
			{
				throw new TypeError('Numeric backend has fixed precision or does not support configuration');
			}
		}

		Object.defineProperty(ConfiguredQuantity, 'numericAdapter', { value: numeric });
		Object.defineProperty(ConfiguredQuantity, 'parserOptions', { value: options });
		Object.defineProperty(ConfiguredQuantity, 'cacheContext', { value: scope });
		Object.defineProperty(ConfiguredQuantity, 'resolvedConfig', { value: Object.freeze({ numeric: numericSettings(numeric), cache: policy }) });

		return ConfiguredQuantity as unknown as C;
	}

	/** Effective settings; isolated classes keep this frozen snapshot for their lifetime. */
	static get config()
	{
		return this.resolvedConfig;

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
		return this.cacheContext.config.conversionResults;
	}

	/** Effective conversion-cache limits, retained by derived quantities. */
	get conversionCacheConfig(): CacheConfig
	{
		return (this.constructor as typeof Quantity).conversionCacheConfig;
	}

	/** Arithmetic backend fixed when this instance is constructed. */
	get numeric(): ArithmeticAdapter<T>
	{
		return this.#numeric;
	}

	/** Complete immutable configuration, including the adapter's numeric option types, retained by derived quantities. */
	get config(): QuantityConfig<Numeric>
	{
		return (this.constructor as typeof Quantity).config as QuantityConfig<Numeric>;
	}

	/** @internal Cache ownership follows the receiver, including mixed-class operations. */
	get cacheScope(): CacheScope
	{
		return (this.constructor as typeof Quantity).cacheContext;
	}

	// Instance variables
	/**
	 * The original scalar/string input, or a normalized value-and-units snapshot
	 * for Quantity and definition inputs. Numeric toString() objects are saved as
	 * their parsed backend scalar. Copies do not retain the source object.
	 * Snapshots are created on first access, frozen, and reused on subsequent reads.
	 * @category Values
	 */
	get initValue(): QuantityInput<T>
	{
		if (this.#initValue === pendingInitValue)
			this.#initValue = Object.freeze({ scalar: this.#scalar, numerator: this.#numerator, denominator: this.#denominator });
		return this.#initValue;
	}

	/**
	 * Numerical value in this quantity’s units, represented by the selected backend.
	 *
	 * Use `qty.numeric.toString(qty.scalar)` for numeric text across backends, or
	 * `qty.numeric.toNumber(qty.scalar)` for a JavaScript number (which may lose precision).
	 * Read-only; create a new quantity to change the value.
	 * @category Values
	 */
	get scalar(): T
	{
		return this.#scalar;
	}

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

	/**
	 * Counted denominator units; an empty array represents unity. Records and arrays are frozen.
	 * @see {@link units} for a human-readable expression.
	 * @category Values
	 */
	get denominator(): readonly UnitPower[]
	{
		return this.#denominator;
	}

	/**
	 * Lazily calculated numerical value in base units; absolute temperatures use kelvin.
	 * Reused after first access when `cache.metadata` is enabled; otherwise recalculated.
	 * @see {@link toBase} for a quantity with base units and this value.
	 * @category Values
	 */
	get baseScalar(): T
	{
		return this.updateBaseScalar();
	}

	/**
	 * Dimensional signature. Prefer {@link isCompatible} over interpreting this string.
	 * @category Values
	 */
	get signature(): string
	{
		return this.#signature;
	}

	/**
	 * Create a quantity from an expression, a scalar and units, or a parsed definition.
	 *
	 * @param initValue - A full expression such as `"3 m"`, a scalar paired with
	 * `initUnits`, or a {@link QuantityDefinition} / existing Quantity.
	 * @param initUnits - Nonempty unit expression for a separate scalar. A scalar in
	 * this expression is replaced by `initValue`. Ignored for quantity and definition inputs.
	 * @param parser - Parser used for string expressions; supplied by the configured entry point.
	 * Required even for definitions; retained for subsequent string operations.
	 * @throws If inputs cannot be parsed, an absolute temperature is below absolute
	 * zero, or absolute-temperature units occur in a compound expression.
	 *
	 * @remarks
	 * Numbers, Decimal instances, numeric strings and objects with numeric `toString()`
	 * output create dimensionless quantities when units are omitted or empty. Use a
	 * decimal string or Decimal when preserving all input digits matters.
	 * An existing quantity keeps its units and converts its scalar to this backend.
	 * Native destinations use numeric conversion; rational-capable backends can exchange
	 * exact terms. Other custom representations fall back to numeric text. Destination range and
	 * representation limits apply, and precision already lost cannot be recovered.
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
		initValue: QuantityInput<T>,
		initUnits: string | undefined,
		parser: Parser<T>
	) {
		if (!parser || typeof parser.parse !== "function")
		{
			throw new Error("A parser is required; use a configured Quantity entry point");
		}

		if (!this.numeric)
		{
			throw new Error('A numeric adapter is required; use createQuantityClass');
		}

		const sourceQuantity = initValue instanceof Quantity ? initValue : undefined;
		const ownResult = initValue instanceof QuantityResult && initValue.numeric === this.numeric;
		const convertBackend = sourceQuantity !== undefined &&
			!acceptsNumericOperand(this.numeric, sourceQuantity.numeric, sourceQuantity.scalar);
		this.parser = parser;

		// Classify object inputs here; scalar and unit validation below avoids
		// running the public definition guard and normalization twice.
		const definitionInput = ownResult || sourceQuantity !== undefined ||
			!this.numeric.isValue(initValue) && initValue !== null && typeof initValue === 'object' && 'scalar' in initValue;

		if (definitionInput)
		{
			const definition = initValue as QuantityDefinition<T>;
			// Cross-backend construction is an explicit conversion boundary. Never
			// pass an opaque foreign scalar to an adapter that cannot interpret it.
			this.#scalar = convertBackend
				? convertNumericScalar(this.numeric, sourceQuantity.numeric, sourceQuantity.scalar)
				: definition.scalar;
			this.#numerator = normalizePowers(definition.numerator);
			this.#denominator = normalizePowers(definition.denominator);
		}
		else
		{
			let parserResult: QuantityDefinition<T>;

			if (initUnits)
			{
				parserResult = { ...this.parse(initUnits), scalar: scalarFrom(this.numeric, initValue) };
			}
			else if(typeof initValue === 'string')
			{
				parserResult = this.parse(initValue);
			}
			else
			{
				parserResult = { scalar: scalarFrom(this.numeric, initValue), numerator: UNITY, denominator: UNITY };
			}

			this.#scalar = parserResult.scalar;
			this.#numerator = normalizePowers(parserResult.numerator);
			this.#denominator = normalizePowers(parserResult.denominator);
		}

		if (!this.numeric.isValue(this.scalar))
		{
			throw new TypeError(`Quantity scalar must be a ${this.numeric.id}`);
		}

		// Parsed scalars and internal results are already in this adapter's context.
		// External definitions and public copies still need context conversion.
		if (definitionInput && !convertBackend && !ownResult)
		{
			this.#scalar = this.numeric.from(this.scalar);
		}

		this.#initValue = definitionInput
			? pendingInitValue
			: typeof initValue === 'object' && !this.numeric.isValue(initValue) ? this.scalar : initValue;

		// Validate dimensions now, without evaluating any numerical conversion factors.
		// Only previously reused structures are admitted. Fresh arrays, unitless
		// quantities and disabled metadata caching retain the normal calculation path.
		const metadata = (this.numerator.length || this.denominator.length) && this.cacheScope.config.metadata
			? this.cacheScope.peek<UnitMetadataCache>('metadata', Quantity.structuralMetadataKey)
				?.get(this.numerator)?.get(this.denominator) : undefined;

		if (metadata && this.isBase === Quantity.prototype.isBase && this.isTemperature === Quantity.prototype.isTemperature)
		{
			this._isBase = metadata.isBase;
			this.#signature = metadata.signature;
			this._baseUnits = metadata.baseUnits;
		}
		else
		{
			// Metadata hits already validated these immutable unit arrays.
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

			this.#signature = this.isBase() ? unitSignature(this)
				: this.isTemperature() ? TEMPERATURE_SIGNATURE : this.getBaseUnits().signature;
		}

		if (this.isTemperature() && isBelowAbsoluteZero(this))
		{
			throw new Error("Temperatures must not be less than absolute zero");
		}
	}

	/** @internal Construct an operand or result with this instance's parser and class. */
	createQuantity(input: QuantityInput<T>, units?: string): Quantity<T, Numeric>
	{
		return this.constructQuantity(input, units, this.parser);
	}

	/** @internal Construct a result already evaluated by this adapter, retaining all validation. */
	createResult(scalar: T, units: UnitStructure): Quantity<T, Numeric>
	{
		// Custom predicates may depend on instance state rather than units alone.
		if (units instanceof Quantity && (units.numerator.length || units.denominator.length) && this.cacheScope.config.metadata &&
			units.isBase === Quantity.prototype.isBase && units.isTemperature === Quantity.prototype.isTemperature)
		{
			const metadata = this.cacheScope.get<UnitMetadataCache>('metadata', Quantity.structuralMetadataKey,
				() => new WeakMap())!;
			let denominators = metadata.get(units.numerator);

			if (!denominators?.has(units.denominator))
			{
				if (!denominators) metadata.set(units.numerator, denominators = new WeakMap());
				denominators.set(units.denominator, {
					isBase: units.isBase(), signature: units.#signature, baseUnits: units._baseUnits,
				});
			}
		}

		return this.constructQuantity(new QuantityResult(scalar, units.numerator, units.denominator, this.numeric),
			undefined, this.parser);
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
	 * must accept every `QuantityInput<T>` form, not only result definitions.
	 * @category Advanced
	 */
	protected constructQuantity(input: QuantityInput<T>, units: string | undefined, parser: Parser<T>): Quantity<T, Numeric>
	{
		const Constructor = this.constructor as new (
			input: QuantityInput<T>, units: string | undefined, parser: Parser<T>
		) => Quantity<T, Numeric>;

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
	clone(): Quantity<T, Numeric>
	{
		return this.createResult(this.scalar, this);
	}

	//
	// Mathematical operations on quantities
	//
	/**
	 * Add a compatible quantity, accounting for its unit scale.
	 * @param other - A quantity expression, definition, Quantity, or scalar input. Scalars
	 * without units are dimensionless and require a compatible receiver.
	 * @returns A new quantity, normally in this quantity's units. Adding degrees to an
	 * absolute temperature returns an absolute temperature.
	 * @throws If units are incompatible, the input is invalid, two absolute temperatures
	 * are added, or the result is below absolute zero. Incompatible backends throw
	 * TypeError; a valid but unrepresentable negative absolute reading throws RangeError.
	 * @example
	 * ```ts
	 * new Quantity('1 m').add('25 cm').scalar.toString(); // "1.25"
	 * ```
	 * @category Arithmetic
	 */
	add(other: QuantityInput<T>) : Quantity<T, Numeric>
	{
		return add(this, other);
	}

	/**
	 * Subtract a compatible quantity, accounting for its unit scale.
	 * @param other - A quantity expression, definition, Quantity, or scalar input. Scalars
	 * without units are dimensionless and require a compatible receiver.
	 * @returns A new quantity in this quantity's units, except that subtracting two
	 * absolute temperatures returns temperature degrees.
	 * @throws If units are incompatible, the input is invalid, an absolute temperature
	 * is subtracted from degrees, or the result is below absolute zero. Incompatible
	 * backends throw TypeError; an unrepresentable valid negative absolute reading throws RangeError.
	 * @example
	 * ```ts
	 * new Quantity('1 m').sub('25 cm').scalar.toString(); // "0.75"
	 * new Quantity('30 tempC').sub('20 tempC').units(); // "degC"
	 * ```
	 * @category Arithmetic
	 */
	sub(other: QuantityInput<T>) : Quantity<T, Numeric>
	{
		return sub(this, other);
	}

	/**
	 * Multiply by a scalar or combine units with another quantity.
	 * @param other - A number, backend scalar, numeric `toString()` object, quantity expression, definition, or Quantity.
	 * @returns A new product. Scalars and quantities without unit tokens preserve the
	 * other operand's units. Compatible quantities align to the left operand's units,
	 * except for temperature degrees. Decimal rounds the complete product once;
	 * other backends follow their own arithmetic and intermediate rounding.
	 * @throws If parsing fails, absolute temperatures are multiplied by a value with
	 * units, or the result is an invalid absolute temperature. Incompatible backends
	 * throw TypeError; an unrepresentable valid negative absolute reading throws RangeError.
	 * @example
	 * ```ts
	 * new Quantity('3 m').mul(2).scalar.toString(); // "6"
	 * new Quantity('3 m').mul('2 m').units(); // "m2"
	 * ```
	 * @category Arithmetic
	 */
	mul(other: QuantityInput<T>) : Quantity<T, Numeric>
	{
		return mul(this, other);
	}

	/**
	 * Divide by a scalar or combine units with another quantity.
	 * @param other - A number, backend scalar, numeric `toString()` object, quantity expression, definition, or Quantity.
	 * @returns A new quotient. Divisors without unit tokens preserve the current units,
	 * including numeric strings and dimensionless Quantity instances. Compatible
	 * quantities align to the left operand's units, except for temperature degrees.
	 * Decimal rounds the complete quotient once; other backends follow their own arithmetic.
	 * @throws If parsing fails, the divisor is an absolute temperature, or an absolute
	 * temperature is divided by a value with units. Incompatible backends throw TypeError.
	 * Invalid absolute readings throw; valid but unrepresentable negative readings throw RangeError.
	 * @remarks Validate zero divisors when accepting user input; this method delegates
	 * scalar division to the numeric adapter rather than explicitly rejecting zero.
	 * @example
	 * ```ts
	 * new Quantity('100 km').div('2 h').scalar.toString(); // "50"
	 * new Quantity('1 m').div('25 cm').isUnitless(); // true
	 * ```
	 * @category Arithmetic
	 */
	div(other: QuantityInput<T>) : Quantity<T, Numeric>
	{
		return div(this, other);
	}

	/**
	 * Raise the scalar and units to an integer power.
	 * @param yy - Safe-integer exponent as a number, numeric string, or backend scalar. Negative
	 * exponents invert the unit expression.
	 * @returns A new quantity with the powered scalar and units.
	 * @throws If the exponent is fractional or invalid, or the resulting units violate
	 * absolute-temperature restrictions. Exponents and resulting counts outside the
	 * safe-integer range throw RangeError.
	 * @remarks Exponent zero returns the dimensionless identity, with scalar one.
	 * Units are stored as counters; powers never allocate repeated unit entries.
	 * Exponent validation is independent of the numeric backend's range settings;
	 * those settings apply to the resulting scalar.
	 * @example
	 * ```ts
	 * new Quantity('3 m').pow(2).scalar.toString(); // "9"
	 * new Quantity('3 m').pow(2).units(); // "m2"
	 * ```
	 * @category Arithmetic
	 */
	pow(yy: number | string | T) : Quantity<T, Numeric>
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
	inverse() : Quantity<T, Numeric>
	{
		return inverse(this);
	}

	//
	// Quantity comparison functions
	//
	/**
	 * Test whether this physical value is equal to another compatible value.
	 * @param b - Quantity or expression, or a number/backend scalar in this quantity's current units.
	 * @returns Whether the comparison holds. Numeric operands compare directly with the scalar;
	 * Quantity and string operands compare compatible physical values. NaN returns false.
	 * @throws If the expression is invalid, units are incompatible, or quantity backends are incompatible.
	 * @example
	 * ```ts
	 * new Quantity('1 m').eq('100 cm'); // true
	 * ```
	 * @see {@link compareTo} for three-way comparison.
	 * @category Comparison
	 */
	eq(b: string | number | T | Quantity<T>): boolean
	{
		const c = this.compareTo(b); return c === 0;
	}

	/**
	 * Test whether this physical value is less than another compatible value.
	 * @param b - Quantity or expression, or a number/backend scalar in this quantity's current units.
	 * @returns Whether the comparison holds. Numeric operands compare directly with the scalar;
	 * Quantity and string operands compare compatible physical values. NaN returns false.
	 * @throws If the expression is invalid, units are incompatible, or quantity backends are incompatible.
	 * @example
	 * ```ts
	 * new Quantity('1 m').lt('2 m'); // true
	 * ```
	 * @see {@link compareTo} for three-way comparison.
	 * @category Comparison
	 */
	lt(b: string | number | T | Quantity<T>): boolean
	{
		const c = this.compareTo(b); return c === -1;
	}

	/**
	 * Test whether this physical value is less than or equal to another compatible value.
	 * @param b - Quantity or expression, or a number/backend scalar in this quantity's current units.
	 * @returns Whether the comparison holds. Numeric operands compare directly with the scalar;
	 * Quantity and string operands compare compatible physical values. NaN returns false.
	 * @throws If the expression is invalid, units are incompatible, or quantity backends are incompatible.
	 * @example
	 * ```ts
	 * new Quantity('1 m').lte('100 cm'); // true
	 * ```
	 * @see {@link compareTo} for three-way comparison.
	 * @category Comparison
	 */
	lte(b: string | number | T | Quantity<T>): boolean
	{
		const c = this.compareTo(b); return c !== undefined && c <= 0;
	}

	/**
	 * Test whether this physical value is greater than another compatible value.
	 * @param b - Quantity or expression, or a number/backend scalar in this quantity's current units.
	 * @returns Whether the comparison holds. Numeric operands compare directly with the scalar;
	 * Quantity and string operands compare compatible physical values. NaN returns false.
	 * @throws If the expression is invalid, units are incompatible, or quantity backends are incompatible.
	 * @example
	 * ```ts
	 * new Quantity('1 m').gt('50 cm'); // true
	 * ```
	 * @see {@link compareTo} for three-way comparison.
	 * @category Comparison
	 */
	gt(b: string | number | T | Quantity<T>): boolean
	{
		const c = this.compareTo(b); return c === 1;
	}

	/**
	 * Test whether this physical value is greater than or equal to another compatible value.
	 * @param b - Quantity or expression, or a number/backend scalar in this quantity's current units.
	 * @returns Whether the comparison holds. Numeric operands compare directly with the scalar;
	 * Quantity and string operands compare compatible physical values. NaN returns false.
	 * @throws If the expression is invalid, units are incompatible, or quantity backends are incompatible.
	 * @example
	 * ```ts
	 * new Quantity('1 m').gte('100 cm'); // true
	 * ```
	 * @see {@link compareTo} for three-way comparison.
	 * @category Comparison
	 */
	gte(b: string | number | T | Quantity<T>): boolean
	{
		const c = this.compareTo(b); return c !== undefined && c >= 0;
	}

	/**
	 * Test exact scalar equality and matching normalized unit records.
	 * @param b - Quantity to compare with this instance.
	 * @returns Whether scalars and ordered unit/prefix/exponent records match. Different compatible
	 * units return false even when they represent the same physical value. NaN returns false.
	 * @throws TypeError when the quantities use incompatible numeric backends.
	 * @example
	 * ```ts
	 * const length = new Quantity('1 m');
	 * length.same(new Quantity('100 cm')); // false
	 * length.eq('100 cm'); // true
	 * ```
	 * @category Comparison
	 */
	same(b: Quantity<T>): boolean
	{
		this.assertBackend(b);
		return this.numeric.compare(this.scalar, b.scalar) === 0 && sameUnits(this, b, this.cacheScope);
	}

	/**
	 * Compare compatible physical values, or a numeric value in the current units.
	 * @param b - Quantity or quantity expression, or a number/backend scalar in this quantity's
	 * current units. Numeric operands require no parsing or temporary Quantity.
	 * @returns `-1` if this quantity is smaller, `0` if equal, or `1` if larger;
	 * `undefined` when either value is NaN. Boolean comparisons return false for NaN.
	 * @throws If the expression is invalid, units are incompatible, or quantity backends
	 * are incompatible. Reciprocal
	 * units are not comparable; convert them explicitly first if appropriate.
	 * @example
	 * ```ts
	 * new Quantity('1 m').compareTo('50 cm'); // 1
	 * new Quantity('1 m').compareTo('100 cm'); // 0
	 * new Quantity('10 m').compareTo(5); // 1 (10 m compared with 5 m)
	 * ```
	 * @category Comparison
	 */
	compareTo(b: string | number | T | Quantity<T>): -1 | 0 | 1 | undefined
	{
		return compare(this, b);
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
	isInverse(b: string | Quantity<unknown>) : boolean
	{
		const other = typeof b === 'string' ? this.createQuantity(b) : b;
		return other instanceof Quantity && areInverseSignatures(this.signature, other.signature);
	}

	/**
	 * Test whether two quantities have the same dimensional signature.
	 * @param b - A Quantity or unit expression; numeric inputs return false.
	 * @returns Whether dimensions match, without comparing scalars or converting units.
	 * Absolute temperatures and temperature degrees share a signature. This check
	 * does not establish backend compatibility or permission for temperature arithmetic.
	 * @throws If a string cannot be parsed.
	 * @example
	 * ```ts
	 * const length = new Quantity('1 m');
	 * length.isCompatible('cm'); // true
	 * length.isCompatible('s'); // false
	 * ```
	 * @category Comparison
	 */
	isCompatible(b: string | number | Quantity<unknown>) : boolean
	{
		const other = typeof b === 'string' ? this.createQuantity(b) : b;
		return other instanceof Quantity && this.signature === other.signature;
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
		return this.numerator.length === 0 && this.denominator.length === 0;
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
	 * Invalid absolute-temperature results throw; valid results requiring a negative-infinite
	 * reading or unrepresentable absolute-zero boundary throw RangeError.
	 * @remarks An existing target supplies units only, including when its backend differs.
	 * The result keeps this quantity's backend, configuration and parser.
	 * @example
	 * ```ts
	 * import { Quantity as NumberQuantity } from '@neutrium/quantity/number';
	 * const mass = new Quantity('25 kg');
	 * mass.to('g').scalar.toString(); // "25000"
	 * mass.to(new Quantity('3 g')).scalar.toString(); // "25000"
	 * mass.to(new NumberQuantity('0 g')).scalar.toString(); // "25000"
	 * new Quantity('2 m').to('m^-1').scalar.toString(); // "0.5"
	 * ```
	 * @see {@link toBase}
	 * @category Conversion
	 */
	to(other: string | Quantity<unknown>) : Quantity<T, Numeric>
	{
		if (!other)
		{
			return this;
		}

		const scope = this.cacheScope;
		const cacheEnabled = scope.enabled('conversionResults');
		const expression = typeof other === 'string' ? other : undefined;

		if (cacheEnabled && expression !== undefined)
		{
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
		}

		// Replace the parsed scalar before construction validates the target value.
		// Existing targets supply units only, even when their backend differs.
		const target = typeof other === 'string' ? this.createQuantity(1, other) : other;
		const identity = sameUnits(target, this, scope);
		const key = cacheEnabled && !identity ? unitKey(target, scope) : undefined;
		let result = identity ? this : key === undefined ? undefined : this.conversionCache?.get(key);

		if (result === undefined)
		{
			result = this.convertToUnits(target);

			if (key !== undefined)
			{
				(this.conversionCache ??= BudgetCache.create<Quantity<T, Numeric>>(this.conversionCacheConfig,
					conversionResultPolicy))?.set(key, result);
			}
		}

		// Identity expressions need only a marker. Other aliases must point to a
		// retained result, so eviction and oversized-entry limits cannot be bypassed.
		if (cacheEnabled && expression !== undefined && (identity || key !== undefined && this.conversionCache?.has(key)))
		{
			(this.conversionExpressionCache ??= BudgetCache.create(this.conversionCacheConfig,
				conversionExpressionPolicy))?.set(expression, key ?? null);
		}

		return result;
	}

	private convertToUnits(target: Quantity<unknown>): Quantity<T, Numeric>
	{
		const reciprocal = !this.isCompatible(target);

		if (reciprocal && !this.isInverse(target))
		{
			throwIncompatibleUnits();
		}

		if (reciprocal && this.isTemperature())
		{
			throw new Error('Cannot divide with temperatures');
		}

		return this.createResult(convert(this, target, reciprocal), target);
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
	toBase() : Quantity<T, Numeric>
	{
		if (this.isBase())
		{
			return this;
		}

		if (this.isTemperature())
		{
			return this.createResult(this.baseScalar, ABSOLUTE_KELVIN_UNITS);
		}

		const base = this.getBaseUnits();
		return this.createResult(this.baseScalar, base);
	}

	private getBaseUnits(): BaseUnitMetadata
	{
		if (this._baseUnits)
		{
			return this._baseUnits;
		}

		const scope = this.cacheScope;
		const cache = scope.get('metadata', Quantity.baseUnitKey, () => new LruCache<string, BaseUnitMetadata>());
		const key = cache ? unitKey(this, scope) : '';
		let result = cache?.get(key);

		if (result === undefined)
		{
			const [numerator, denominator] = basePowers(this);
			result = Object.freeze({ numerator, denominator, signature: unitSignature({ numerator, denominator }) });
			cache?.set(key, result);
		}

		if (cache)
		{
			this._baseUnits = result;
		}

		return result;
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

		const result = this.numerator.every(term => !term.prefix && Quantity.BASE_UNITS.includes(term.unit)) &&
			this.denominator.every(term => !term.prefix && Quantity.BASE_UNITS.includes(term.unit));

		if (this.cacheScope.enabled('metadata'))
		{
			this._isBase = result;
		}

		return result;
	}

	/**
	 * Format the counted units as a unit expression.
	 * @returns The expression without its scalar; an empty string for a unitless quantity.
	 * @remarks Spelling and grouping may differ from the input. Powers use compact
	 * notation such as `m2`; numerator multiplication uses `*` and denominator
	 * multiplication uses tightly coupled `.`, as in `kg/m.s`. Output aliases preserve
	 * unit identity when parsed by either bundled parser. The result is cached when
	 * `cache.metadata` is enabled; custom parsers may use a different input syntax.
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

		const scope = this.cacheScope;
		const result = formatUnits(this, scope);

		if (scope.enabled('metadata'))
		{
			this._units = result;
		}

		return result;
	}

	private assertBackend(value: unknown): void
	{
		if (value instanceof Quantity && !acceptsNumericOperand(this.numeric, value.numeric, value.scalar))
		{
			throw new TypeError('Cannot mix numeric backends; convert the scalar explicitly');
		}
	}

	private parse(text: string): QuantityDefinition<T>
	{
		return this.parser.parse(text, this.numeric, this.cacheScope);
	}

	private updateBaseScalar(): T
	{
		if (this._baseScalar !== undefined)
		{
			return this._baseScalar;
		}

		const result = this.isBase() ? this.scalar : base(this);

		if (this.cacheScope.enabled('metadata'))
		{
			this._baseScalar = result;
		}

		return result;
	}
}
