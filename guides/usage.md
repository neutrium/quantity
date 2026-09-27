# Working with quantities

## Construct and read a quantity

Use `new Quantity(...)`, then read its {@link Quantity.Quantity.scalar | scalar} and {@link Quantity.Quantity.units | units}.

```ts
import { Quantity } from '@neutrium/quantity';

const length = new Quantity('1.25', 'm');
const display = `${length.scalar.toString()} ${length.units()}`; // "1.25 m"
new Quantity('m').scalar.toString(); // "1"
new Quantity('2').units(); // ""
```

The scalar is an `@neutrium/decimal` Decimal. Supply decimal strings when every input digit matters: a JavaScript number may already have been rounded before it reaches the constructor. `scalar.toNumber()` converts back to a JavaScript number and may lose precision.

| Input                           | Example                  | Behavior                               |
| ------------------------------- | ------------------------ | -------------------------------------- |
| Scalar and units in one string  | `new Quantity('2.5 m')`  | Parses both parts.                     |
| Separate scalar and units       | `new Quantity(2.5, 'm')` | Uses the first argument as the scalar. |
| Unit expression only            | `new Quantity('m/s')`    | Defaults to a scalar of 1.             |
| Scalar only                     | `new Quantity(2.5)`      | Creates a dimensionless quantity.     |
| Numeric string or object        | `new Quantity({ toString: () => '2.5' })` | Creates a dimensionless quantity. |
| Existing quantity or definition | `new Quantity(length)`   | Normalizes the value; copies external records and may share frozen arrays.     |

Numbers, numeric strings, Decimal instances, and objects whose `toString()` returns a numeric literal create dimensionless quantities when units are omitted or empty. For example, `new Quantity(2)`, `new Quantity('2')`, and `new Quantity(new Decimal(2), '')` all represent the same value. Numeric objects are read once and saved as a Decimal snapshot; their text must be a scalar, not a unit expression. Decimal configuration applies to the resulting scalar.

Quantity methods are shared on the prototype and require their instance as `this`. Arithmetic, comparison, and temperature methods are no longer automatically bound. When passing a method as a callback, wrap it or explicitly bind it:

```ts
const length = new Quantity('2 m');
const matches = ['200 cm', '3 m'].map(value => length.eq(value)); // [true, false]
const equalsLength = length.eq.bind(length);

equalsLength('200 cm'); // true
```

## Write unit expressions

The default parser accepts multiplication (`*`, `.`, or spaces), division (`/`), integer powers (`^`), and parenthesized groups:

```ts
new Quantity('2 (kg*m/s^2)').to('N').scalar.toString(); // "2"
new Quantity('3 m^2').units(); // "m2"
new Quantity('2/s').scalar.toString(); // "2"
new Quantity('2/(m*s)').units(); // "1/m/s"
```

Scalars may precede division directly, including scientific notation such as `1e3/s`.

Both parsers apply powers first, then tightly coupled dot multiplication (`.`), then ordinary multiplication (`*` or whitespace) and division from left to right. `kg/m.s` means `kg/(m*s)`, whereas `kg/m*s` and `kg/m s` mean `(kg/m)*s`. Spaces around a dot do not change its precedence. `kg/m/s` also means `kg/(m*s)`.

The normalized output is not a copy of the input spelling. It selects unambiguous aliases, uses `*` for numerator products, and uses compact powers. Denominator terms are joined with tightly coupled dots: `kg/m/s` is displayed as `kg/m.s`, meaning kilograms divided by the product of metres and seconds. Both bundled parsers accept nonempty formatted unit expressions, including `1/m` and `1/m.s`. Unitless output is empty; parse `"1"` to represent unity explicitly.

## Convert units

{@link Quantity.Quantity.to | Quantity.to} accepts a target unit string or another Quantity. Only the target's units are used; any target scalar is ignored, including zero or negative values. Prefer a units-only string to make your intent clear.

```ts
const length = new Quantity('2 m');
length.to('cm').scalar.toString(); // "200"
length.to('7 cm').scalar.toString(); // "200"
length.to(new Quantity('7 cm')).scalar.toString(); // "200"
new Quantity('250 cm').toBase().scalar.toString(); // "2.5"
```

Compatible dimensions convert directly. Reciprocal dimensions also work: `new Quantity('2 m').to('m^-1')` has scalar `0.5`. Unrelated dimensions such as length and time throw as does reciprocal conversion of zero.

Conversions can return the original instance or a cached result. Equivalent target strings such as `cm`, `centimetre`, and `2 cm` share a result. String lookups and normalized conversion results each default to at most 1,024 entries per source, with least-recently-used eviction and configurable byte budgets.

## Subclasses with constructor state

The default derived-quantity factory calls `new this.constructor(input, units, parser)`. Subclasses that retain this constructor signature need no extra code. If your constructor requires additional arguments, override the protected `constructQuantity(input, units, parser)` hook and supply the state those arguments require:

```ts
import { Quantity } from '@neutrium/quantity';
import type { QuantityInitParam, QuantityDefinition, Parser } from '@neutrium/quantity/core';

class LabelledQuantity extends Quantity {
    constructor(
        input: QuantityInitParam,
        readonly label: string,
        units?: string,
        parser?: Parser<QuantityDefinition>,
    ) {
        super(input, units, parser);
    }

    protected override constructQuantity(
        input: QuantityInitParam,
        units: string | undefined,
        parser: Parser<QuantityDefinition>,
    ): LabelledQuantity {
        const Constructor = this.constructor as typeof LabelledQuantity;
        return new Constructor(input, this.label, units, parser);
    }
}

const EngineeringQuantity = LabelledQuantity.withConfig({ precision: 30 });
const length = new EngineeringQuantity('2 m', 'length');
const result = length.add('1 m').to('cm');
result.scalar.toString(); // "300"
result instanceof EngineeringQuantity; // true
if (result instanceof LabelledQuantity) result.label; // "length"
```

Use `this.constructor` inside the hook so results retain the current configured class; hard-coding `LabelledQuantity` would lose settings from `withConfig()`. Forward the supplied parser, including per-instance overrides, and preserve the input and units arguments. The hook constructs temporary operands and conversion targets as well as final results, so its input must support all `QuantityInitParam` forms. Subclass code decides how to copy or share its own state.

This contract applies to the default, Regex and `createQuantityClass()` entry points. `withConfig()` preserves your constructor's TypeScript signature but does not infer additional arguments. Inherited arithmetic and conversion methods continue to declare `Quantity` results; use a type guard to access subclass members.

## Configuration

Use `Quantity.withConfig()` when calculations need specific handling:

```ts
import { Quantity } from '@neutrium/quantity';

const EngineeringQuantity = Quantity.withConfig({
    precision: 30,
    rounding: 'half-up',
});

const length = new EngineeringQuantity('1 ft');
length.to('m').scalar.toString(); // "0.3048"
EngineeringQuantity.config.precision; // 30
```
All settings supported by `[@neutrium/decimal](https://github.com/neutrium/decimal)` are supported in quantity for number handling.

The new class snapshots its parent's effective settings and applies the supplied overrides. Its settings
are fixed; call `withConfig()` again to create another class. Both the class and its instances expose a frozen `config` snapshot

Copies, conversions, and arithmetic results retain the receiving class and configuration. When operands have different configurations, arithmetic uses the receiver's settings; conversion targets supply units only. Scalar values supplied as Decimal instances are adopted into an isolated class's context without rounding their significant digits, although its input exponent limits still apply.

Parser options use the same `withConfig()` call:

```ts
const BoundedQuantity = Quantity.withConfig({
    precision: 30,
    rounding: 'half-even',
    parser: { cache: { maxEntries: 512, maxBytes: 1024 * 1024 } },
    conversionCache: { maxEntries: 128, maxBytes: 256 * 1024 },
});
const speed = new BoundedQuantity('12 m/s');
BoundedQuantity.config.precision; // 30
BoundedQuantity.parserConfig.cache.maxBytes; // 1048576
BoundedQuantity.conversionCacheConfig.maxBytes; // 262144
speed.parserConfig === BoundedQuantity.parserConfig; // true
```

Both bundled parsers default to 1,024 retained plans and a **4 MiB estimated-byte budget**. Either limit can evict the least recently used plans. Plans larger than the byte budget are parsed normally without being cached; setting either limit to zero disables plan caching. Limits must be nonnegative safe integers.

Parser options are frozen snapshots. Supplying `parser` options creates a separate cache scope shared by instances of that configured class, including derived quantities. Chaining `withConfig()` merges partial cache settings; changing only numerical settings keeps the parent's parser scope. Plain parser instances share the default scope. The byte budget estimates retained keys, unit records and scalar instructions, not total JavaScript heap usage or peak parsing memory. It excludes fixed grammar/catalog data and Quantity's conversion and structural caches.

`conversionCache` independently controls each Quantity's expression-to-unit-key cache and converted-result cache. Each defaults to **1,024 entries and 4 MiB of estimated payload**. The limit applies separately to the two caches, per instance; it is not a process-wide heap limit. Result accounting includes the unit records, keys and scalar digits, but not caches subsequently populated on returned results or shared catalog/structural caches. String and Quantity targets use the same bounded result cache. Oversized entries bypass retention without evicting hot entries, and either limit set to zero disables conversion caching.

Successful same-unit string conversions retain only a marker in the expression cache. While retained, subsequent calls return the original quantity without parsing or constructing a target. These markers share the expression entry and byte limits and are invalidated when the quantity's Decimal configuration changes.

An explicitly supplied parser controls its own settings; it is retained by derived quantities. Custom parser factories receive `ParserConfig` and should forward it to their parser or implement the limits themselves; zero-argument factories remain supported. See [parser configuration](parsers.md) for direct parser usage.

The original entry points continue using the shared `Decimal.config` from `@neutrium/decimal`. Changing that configuration invalidates their numeric caches: subsequent conversions and `baseScalar` reads use the new settings. Base values are calculated on first access and cached; construction still validates units, dimensional counts, and absolute zero immediately. Unit metadata is shared independently of numeric configuration. Isolated classes and their cached results are unaffected. Stored scalars and already returned results are never retroactively recalculated; increasing precision cannot recover digits lost in an input or earlier operation.

Arithmetic uses stored operands without clamping them to newly narrowed exponent limits first. For example, quantities created as `1e30 m` can still divide to `1` after setting `maxE: 20`. Current precision, rounding, and range limits apply to the result. Constructing a quantity from a new scalar or expression still follows the current input limits.

Unit conversions and cross-unit sums combine exact values before rounding the result. Absolute-temperature conversions and differences, including reciprocal conversion targets, cancel offsets before final rounding, retaining tiny differences without expanding gaps between decimal exponents. Exact absolute zero is preserved in every scale. If rounding a valid conversion or arithmetic result would put it below absolute zero, the result uses the exact boundary (`-273.15 tempC` or `-459.67 tempF`); this boundary value can require more digits than the configured precision. Sources below absolute zero are rejected before rounding. This also applies when adding/subtracting intervals or scaling an absolute-temperature reading: an invalid physical result cannot be rounded back into the valid range. The configured exponent limits still apply to the final scalar. Multiplication, division, and reciprocal conversion combine scalar and unit factors before enforcing the result's exponent limits. Large counted
factors use progressively refined bounds; a result is returned only when both bounds agree after final rounding and boundary validation. If Decimal's maximum precision is insufficient to establish the result, the operation throws a `RangeError` instead of returning an unverified approximation. Parsing a Nearley scalar expression still evaluates its written operations in order, each using the selected context; it does not reassociate a user's expression.

Exponents are independent of the quantity's Decimal range limits. `pow()` validates the original exponent as a safe integer, so a tiny fractional exponent cannot underflow into zero. Nearley likewise preserves exponent literals while evaluating powers; result scalars still use the configured precision, rounding, and range.

Physical comparisons do not round operands to either caller's precision. Exact factor cancellation and bounded-precision refinement preserve equality and ordering across unit spellings and configurations. A rounded conversion is a new value: a repeating conversion such as `1 degF` to `degC` need not compare exactly equal to the original quantity after rounding. Compare rounded values in the same units when that is the intended application policy.

Relative conversions and comparisons can handle units whose separate base factors overflow or underflow. For example, `2 km4000000000000000` compares greater than `1 km4000000000000000`, and converting to `km4000000000000000*s/s` preserves the scalar `2`. Scale factors and scalar values are combined before final range limits are applied. An actual final result outside Decimal's range still becomes Infinity or zero; unsafe dimensional exponents still throw.

## Calculate and compare

Converting an absolute temperature to degrees treats its numeric reading as an interval in the source scale, without an absolute-temperature offset. For example, `new Quantity('20 tempC').to('degC')` returns 20 degrees Celsius, and `.to('mdegC')` returns 20000 millidegrees Celsius. Converting through `degC` gives the same result. This also applies to equivalent compound interval targets such as `degC*m/m`. Absolute-temperature targets still use offsets: `.to('tempK')` returns 293.15 kelvin.

Arithmetic accepts quantity expressions, definitions, quantities, and scalar inputs. For addition and subtraction, numbers, Decimal values, and numeric objects represent dimensionless quantities: `new Quantity(2).add(3)` produces `5`, while `new Quantity(2, 'm').add(3)` throws for incompatible units. Multiplication and division by scalars preserve the existing units, whether supplied as a number, numeric string, Decimal, numeric object, or Quantity with no unit tokens. For example, `new Quantity('50 cm/m').mul('2')` returns `100 cm/m`, and `.div({ toString: () => '2' })` returns `25 cm/m`. Explicit unit ratios such as `cm/m` retain their unit tokens and combine normally when both operands have units.

```ts
const length = new Quantity('1 m');
length.add('25 cm').scalar.toString(); // "1.25"
length.mul(3).scalar.toString(); // "3"
length.div('25 cm').scalar.toString(); // "4"
length.div('25 cm').isUnitless(); // true
length.scalar.toString(); // "1" — operations leave the operand unchanged
```

{@link Quantity.Quantity.eq | Quantity.eq} compares physical values without rounding them to the receiver’s precision. {@link Quantity.Quantity.same | Quantity.same} requires identical scalar values and normalized units. Ordering methods throw for incompatible dimensions; {@link Quantity.Quantity.isCompatible | Quantity.isCompatible} checks dimensions without comparing values.

```ts
const length = new Quantity('1 m');
length.eq('100 cm'); // true
length.same(new Quantity('100 cm')); // false
length.compareTo('50 cm'); // 1
length.isCompatible('s'); // false
```

Unitless addition also accepts numbers and Decimal values: `new Quantity(2).add(3)`
and `new Quantity('2').add('3')` both produce `5`.

`eq`, `lt`, `lte`, `gt`, `gte`, and `compareTo` accept numbers and Decimal values as
thresholds in the receiving quantity's current units. These operands compare
directly with its scalar, without parsing or constructing another Quantity:

```ts
new Quantity('10 m').gt(5); // true: 10 m > 5 m
new Quantity('100 cm').eq(1); // false: 100 cm is not 1 cm
new Quantity('100 cm').eq('1 m'); // true: explicit unit conversion
new Quantity('100 cm').to('m').eq(1); // true
```

Use a Decimal constructed from a string when every input digit matters. Numeric
temperature thresholds compare the reading in its current scale. String operands
remain quantity expressions: `'100'` is unitless, whereas numeric `100` uses the
receiver's units. `same()` still requires another Quantity.

`compareTo()` returns `-1 | 0 | 1 | undefined`. Check for `undefined` before using its result as a sort
order: it means a value is NaN. All boolean comparisons return false for NaN. Incompatible dimensions still throw.

`isInverse()` compares reciprocal dimensions without using scalar values: `new Quantity('0 m').isInverse('1/m')` returns `true`. An existing Quantity operand requires no parsing or temporary Quantity. A string operand is parsed once using the receiving quantity's parser. Dimensional compatibility does not guarantee that inversion is permitted: `inverse()` and reciprocal `to()` still reject zero values and absolute temperatures.

## Errors and current edge cases

Parsing, incompatible arithmetic, and invalid absolute-temperature operations can throw. Catch errors at the boundary where users supply expressions:

```ts
function convert(input: string, targetUnits: string): string
{
    try
    {
        return new Quantity(input).to(targetUnits).scalar.toString();
    }
    catch (error)
    {
        return error instanceof Error ? error.message : 'Unable to convert quantity';
    }
}
```

- {@link Quantity.Quantity.inverse | Quantity.inverse} rejects zero explicitly.
- {@link Quantity.Quantity.div | Quantity.div} delegates scalar division to Decimal; check zero divisors if your application must reject them.
- {@link Quantity.Quantity.pow | Quantity.pow} supports integer exponents. Exponent zero returns   the dimensionless identity (`1` with no units).
- {@link Quantity.Quantity.clone | Quantity.clone} creates a new instance but shares scalar and unit arrays; it preserves the configured parser and does not retain the source quantity. For Quantity or definition inputs, `initValue` is a normalized snapshot containing only `scalar`, `numerator`, and `denominator`. String, number, and Decimal inputs remain unchanged; numeric objects are saved   as parsed Decimal snapshots.
- Quantities expose read-only values. Assigning to `scalar`, `signature`, `baseScalar`,   `numerator`, `denominator`, or `initValue` is unsupported in TypeScript and rejected   in strict-mode JavaScript. Create a new quantity to change its value or units.
