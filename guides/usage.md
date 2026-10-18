# Working with quantities

## Construct and read a quantity

Use `new Quantity(...)`, then read its {@link factory.Quantity.scalar | scalar} and {@link factory.Quantity.units | units}.

```ts
import { Quantity } from '@neutrium/quantity';

const length = new Quantity('1.25', 'm');
const display = `${length.scalar.toString()} ${length.units()}`; // "1.25 m"
new Quantity('m').scalar.toString(); // "1"
new Quantity('2').units(); // ""
```

The default preset stores a Decimal scalar. Use `quantity.numeric.toString(quantity.scalar)` or `quantity.numeric.toNumber(quantity.scalar)` when writing code that supports any backend. Conversion to a number may lose precision. With the Decimal preset, supply strings when every input digit matters: a JavaScript number may already have been rounded before construction.

| Input                           | Example                  | Behavior                               |
| ------------------------------- | ------------------------ | -------------------------------------- |
| Scalar and units in one string  | `new Quantity('2.5 m')`  | Parses both parts.                     |
| Separate scalar and units       | `new Quantity(2.5, 'm')` | Uses the first argument as the scalar. |
| Unit expression only            | `new Quantity('m/s')`    | Defaults to a scalar of 1.             |
| Scalar only                     | `new Quantity(2.5)`      | Creates a dimensionless quantity.     |
| Numeric string or object        | `new Quantity({ toString: () => '2.5' })` | Creates a dimensionless quantity. |
| Existing quantity | `new Quantity(length)` | Converts the scalar to the destination backend and preserves the units. |
| Definition | `new Quantity({ scalar: length.scalar, numerator: length.numerator, denominator: length.denominator })` | Requires a destination-native scalar; normalizes and freezes the unit records. |

Numbers, numeric strings, Decimal instances, and objects whose `toString()` returns a numeric literal create dimensionless quantities when units are omitted or empty. For example, `new Quantity(2)`, `new Quantity('2')`, and `new Quantity(new Decimal(2), '')` all represent the same value. Non-native numeric objects are read once and saved as a backend scalar; their text must be a scalar, not a unit expression. Native backend scalars are accepted directly. The destination's numeric configuration applies during construction.

```ts
import { Quantity as NumberQuantity } from '@neutrium/quantity/number';

const native = new NumberQuantity('1.25 km/h');
const decimal = new Quantity(native);
decimal.units(); // "km/h"
decimal.scalar.toString(); // "1.25"
```

Use explicit construction to switch backends. Arithmetic and comparisons reject incompatible backend quantities; copying cannot recover precision already lost in the source.

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
new Quantity('2/(m*s)').units(); // "1/m.s"
```

Scalars may precede division directly, including scientific notation such as `1e3/s`.

Both parsers apply powers first, then tightly coupled dot multiplication (`.`), then ordinary multiplication (`*` or whitespace) and division from left to right. `kg/m.s` means `kg/(m*s)`, whereas `kg/m*s` and `kg/m s` mean `(kg/m)*s`. Spaces around a dot do not change its precedence. `kg/m/s` also means `kg/(m*s)`.

The normalized output is not a copy of the input spelling. It selects unambiguous aliases, uses `*` for numerator products, and uses compact powers. Denominator terms are joined with tightly coupled dots: `kg/m/s` is displayed as `kg/m.s`, meaning kilograms divided by the product of metres and seconds. Both bundled parsers accept nonempty formatted unit expressions, including `1/m` and `1/m.s`. Unitless output is empty; parse `"1"` to represent unity explicitly.

## Convert units

{@link factory.Quantity.to | Quantity.to} accepts a target unit string or another Quantity. Only the target's units are used; any target scalar is ignored, including zero or negative values. Prefer a units-only string to make your intent clear.

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
import type { QuantityInput, Parser } from '@neutrium/quantity/factory';
import type { Decimal } from '@neutrium/decimal';

class LabelledQuantity extends Quantity
{
    constructor(
        input: QuantityInput<Decimal>,
        readonly label: string,
        units?: string,
        parser?: Parser<Decimal>,
    ) {
        super(input, units, parser);
    }

    protected override constructQuantity(
        input: QuantityInput<Decimal>,
        units: string | undefined,
        parser: Parser<Decimal>,
    ): LabelledQuantity
	{
        const Constructor = this.constructor as typeof LabelledQuantity;
        return new Constructor(input, this.label, units, parser);
    }
}

const EngineeringQuantity = LabelledQuantity.withConfig({ numeric: { precision: 30 } });
const length = new EngineeringQuantity('2 m', 'length');
const result = length.add('1 m').to('cm');
result.scalar.toString(); // "300"
result instanceof EngineeringQuantity; // true

if (result instanceof LabelledQuantity)
{
	result.label; // "length"
}
```

Use `this.constructor` inside the hook so results retain the current configured class; hard-coding `LabelledQuantity` would lose settings from `withConfig()`. Forward the supplied parser, including per-instance overrides, and preserve the input and units arguments. The hook constructs temporary operands and conversion targets as well as final results, so its input must support all `QuantityInput<Decimal>` forms. Subclass code decides how to copy or share its own state.

This contract applies to the default, Regex and `createQuantityClass()` entry points. `withConfig()` preserves your constructor's TypeScript signature but does not infer additional arguments. Inherited arithmetic and conversion methods continue to declare `Quantity` results; use a type guard to access subclass members.

## Configuration

Use `Quantity.withConfig()` with nested numeric settings and cache policies:

```ts
import { Quantity } from '@neutrium/quantity';

const EngineeringQuantity = Quantity.withConfig({
    numeric: { precision: 30, rounding: 'half-even' },
    cache: {
        parser: { maxEntries: 1024, maxBytes: 1024 * 1024 },
        conversionResults: { maxEntries: 256, maxBytes: 256 * 1024 },
        scalarTerms: false,
    },
});

const speed = new EngineeringQuantity('36 km/h');
EngineeringQuantity.config.numeric.precision; // 30
EngineeringQuantity.config.cache.parser.maxBytes; // 1048576
speed.config === EngineeringQuantity.config; // true
```

Numeric values supplied as Decimal instances are adopted into the receiving context without rounding their significant digits; input exponent limits still apply. Operations between compatible backend contexts use the receiver’s settings. A Quantity passed to `to()` supplies units only and does not select the result backend.

`config` is the complete immutable snapshot on the class and its instances. Derived quantities retain the receiver's class and settings. Numeric options are checked against the adapter's configuration interface; fixed-precision adapters do not accept numeric overrides. Unknown top-level options and cache-family names are rejected.

All input settings are optional. Nested overrides merge with the parent class; omission preserves inherited settings. `cache: false` disables every optional library cache, and `cache: true` restores all default cache settings. A family-level `false` disables that family, and `true` restores its defaults. An object overrides inherited limits, so use `true` to re-enable a family whose inherited limits are zero.

```ts
const Uncached = EngineeringQuantity.withConfig({ cache: false });
const ParsingOnly = Uncached.withConfig({ cache: { parser: true } });
const Defaults = Uncached.withConfig({ cache: true });
```

| Cache family | Input | Default |
| --- | --- | --- |
| `parser` | Boolean or `{ maxEntries?, maxBytes? }` | 1,024 entries, 4 MiB per parser plan/token cache |
| `conversionResults` | Boolean or limits | 1,024 entries, 4 MiB per instance result/expression cache |
| `unitFactors` | Boolean or limits | 1,024 entries, 1 MiB |
| `conversionPlans` | Boolean or limits | 1,024 entries, 1 MiB |
| `scalarTerms` | Boolean | Enabled; used for object scalars on the exact calculation path |
| `temperatureConstants` | Boolean | Enabled; up to four scales per adapter |
| `metadata` | Boolean | Enabled; unit identity, base metadata, formatting, lazy instance values |

Resolved entry/byte settings always contain both limits; a disabled family has zero limits. Setting either limit to zero also disables that family. Byte budgets estimate retained cache data, not total heap usage or peak calculation memory. Each listed cache uses its own budget; `maxBytes` is not a global memory cap.

A cache-policy override creates an independent internal cache scope. Numeric-only configuration inherits the parent's scope, with numeric data still separated by adapter instance. Cache-only configuration preserves the numeric adapter. Standalone parser instances retain their `{ cache: { ... } }` constructor API; the Quantity factory maps `cache.parser` to that parser configuration. An explicitly supplied parser can use its own limits, but disabling the class's parser cache also disables bundled-parser retention. Custom parsers and backends remain responsible for honoring settings inside their own implementations.

Disabled caches are bypassed for reads and writes. Static unit definitions, compiled grammar and immutable-state validation markers remain available. Calculations and errors are identical with caching disabled, but repeated conversions can return distinct objects and lazy values are recalculated. An unchanged-unit conversion can still return the original quantity.

The factory accepts the same configuration shape:

```ts
import { createQuantityClass } from '@neutrium/quantity/factory';
import { NumberAdapter } from '@neutrium/utilities/number';
const numberAdapter = new NumberAdapter();
import { NearleyParser } from '@neutrium/quantity/parsers/nearley';

const NativeQuantity = createQuantityClass({
    numeric: numberAdapter,
    parser: config => new NearleyParser(config),
    config: { cache: false },
});
```

All presets use isolated utilities adapters. Changing global `Decimal.config` does not change an existing Quantity class or its cached values. Configure an adapter before passing it to the factory, or use `withConfig()` for adapters that support it.

Scalar arithmetic follows the selected adapter's precision, rounding and range semantics. The default Decimal backend retains rational intermediates for conversions, cross-unit arithmetic and temperature calculations, and applies output rounding only to the final result of each operation. Decimal cross-unit comparisons evaluate unrounded values. Float, double and custom backends use their adapters throughout instead: scalars stay in their native representation, and intermediate rounding and range limits apply. Shared dimensional and temperature checks remain in place. See [numeric backends](numeric-backends.md) for the calculation guarantees and custom adapter contract.

For example, at precision 6, `new Q('1 m').sub('100.0001 cm')` retains `-0.000001 m`. With `maxE: 20`, `new Q('1e20 m').div('1e20 km')` returns `0.001` instead of losing the divisor to intermediate overflow. Each method call still returns a scalar rounded to the receiver's settings; subsequent calls operate on that returned value.

Exponents are independent of the quantity's Decimal range limits. `pow()` validates the original exponent as a safe integer, so a tiny fractional exponent cannot underflow into zero. Nearley likewise preserves exponent literals while evaluating powers; result scalars still use the configured precision, rounding, and range. Both supported Decimal tiers apply output rounding and range limits to the final integer-power result.

Decimal cross-unit comparisons evaluate unrounded physical values; native and custom comparisons use backend-rounded values. A rounded conversion is a new value and may not compare exactly equal to its source. Compare values in the same units or apply an application-specific tolerance when rounding matters.

Relative conversions and comparisons can handle units whose separate base factors overflow or underflow. For example, `2 km4000000000000000` compares greater than `1 km4000000000000000`, and converting to `km4000000000000000*s/s` preserves the scalar `2`. Matching factors cancel before evaluation; remaining operations use the adapter’s range limits. Final scalar overflow and underflow follow the selected backend, subject to Quantity's [absolute-temperature restrictions](temperatures.md#precision-and-absolute-zero). Unsafe dimensional exponents still throw.

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

{@link factory.Quantity.eq | Quantity.eq} compares values using the receiver’s numeric adapter. {@link factory.Quantity.same | Quantity.same} requires identical scalar values and normalized units. Ordering methods throw for incompatible dimensions; {@link factory.Quantity.isCompatible | Quantity.isCompatible} checks dimensions without comparing values.

```ts
const length = new Quantity('1 m');
length.eq('100 cm'); // true
length.same(new Quantity('100 cm')); // false
length.compareTo('50 cm'); // 1
length.isCompatible('s'); // false
```

Unitless addition also accepts numbers and Decimal values: `new Quantity(2).add(3)`
and `new Quantity('2').add('3')` both produce `5`.

`eq`, `lt`, `lte`, `gt`, `gte`, and `compareTo` accept numbers and native backend scalars as
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

- {@link factory.Quantity.inverse | Quantity.inverse} rejects zero explicitly.
- {@link factory.Quantity.div | Quantity.div} delegates scalar division to the selected adapter; check zero divisors if your application must reject them.
- {@link factory.Quantity.pow | Quantity.pow} supports integer exponents. Exponent zero returns the dimensionless identity (`1` with no units).
- {@link factory.Quantity.clone | Quantity.clone} creates a new instance but shares scalar and unit arrays; it preserves the configured parser and does not retain the source quantity. For Quantity or definition inputs, `initValue` is a normalized snapshot containing only `scalar`, `numerator`, and `denominator`. String, number, and native backend scalar inputs remain unchanged; other numeric objects are saved as parsed backend scalars.
- Quantities expose read-only values. Assigning to `scalar`, `signature`, `baseScalar`, `numerator`, `denominator`, or `initValue` is unsupported in TypeScript and rejected in strict-mode JavaScript. Create a new quantity to change its value or units.
