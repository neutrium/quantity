# Numeric backends

A numeric backend determines how Quantity stores scalar values and performs calculations. The default uses Decimal arithmetic. Choose JavaScript numbers when
ordinary floating-point behavior suits your application, or configure another backend through the factory.

## Choose a preset

| Import | Scalar type | Parser | When to use it |
| --- | --- | --- | --- |
| `@neutrium/quantity` | Decimal | Nearley | The default for configurable decimal precision and the full expression syntax. |
| `@neutrium/quantity/regex` | Decimal | Regex | Decimal calculations with simpler input syntax and a smaller parser bundle. |
| `@neutrium/quantity/number` | JavaScript `number` | Nearley | Native floating-point calculations and direct integration with number-based APIs. |

All three provide the same unit conversion, arithmetic, comparison, and temperature operations. Parser choice controls accepted expressions; it does not change the numeric representation. See the [parser guide](parsers.md) for syntax differences.

The two Decimal presets use `DecimalScientificAdapter` from `@neutrium/utilities`. The number preset uses `NumberAdapter`. You do not need to configure an adapter to use a preset:

```ts
import { Quantity } from '@neutrium/quantity';
import { Quantity as NumberQuantity } from '@neutrium/quantity/number';

new Quantity('0.1').add('0.2').scalar.toString(); // "0.3"
new NumberQuantity('0.1').add('0.2').scalar; // 0.30000000000000004
new NumberQuantity('2 km').to('m').scalar; // 2000
```

Decimal scalars provide methods such as `toString()` and `toNumber()`. The number preset returns numbers directly. Converting a Decimal to a JavaScript number can lose precision.

## Precision and rounding

Use Decimal when decimal precision, rounding policy, or reliable cross-unit comparisons matter. Supply decimal strings when preserving input digits is important: a JavaScript number may already have been rounded before Quantity receives it.

Decimal conversions and cross-unit arithmetic combine unit factors and values before rounding the result. Comparisons preserve physical differences that could be lost by first rounding both values into common units. Each returned arithmetic or conversion result still has finite precision, and conversion accuracy depends on the precision of the unit definitions. A rounded conversion need not compare exactly equal to its source.

The number backend follows JavaScript's binary64 arithmetic. Rounding, overflow, and underflow can occur during calculations, including unit conversion. Distinct physical values can therefore compare equal after conversion rounding. Use the Decimal preset if that behavior is unsuitable for your application.

Temperature restrictions apply to every backend, including rejecting values below absolute zero. Details of rounding and representable boundaries depend on the backend; see [temperature range handling](temperatures.md#precision-and-absolute-zero).

## Configure Decimal calculations

Create a configured class with `withConfig()`. Numeric options belong under `numeric`:

```ts
import { Quantity } from '@neutrium/quantity';

const PreciseQuantity = Quantity.withConfig({
    numeric: { precision: 30, rounding: 'half-even' },
});

const length = new PreciseQuantity('1 ft');
length.to('m').scalar.toString(); // "0.3048"
PreciseQuantity.config.numeric.precision; // 30
```

Precision counts significant digits, not decimal places. Configuration is immutable; `withConfig()` creates a new class without changing the original. Conversions, arithmetic, and clones retain the receiving class's numeric settings and parser. Changes to global `Decimal.config` do not change Quantity's presets or configured classes.

The number preset has fixed numeric behavior and does not accept Decimal precision or rounding options. Cache settings are available with every backend, including `Quantity.withConfig({ cache: false })`. See [configuration](usage.md#configuration) for cache policies and budgets.

## Switch between backends

Construct a quantity with the destination class to change its backend explicitly:

```ts
import { Quantity } from '@neutrium/quantity';
import { Quantity as NumberQuantity } from '@neutrium/quantity/number';

const native = new NumberQuantity('1.25 km/h');
const decimal = new Quantity(native);
const backToNumber = new NumberQuantity(decimal);

decimal.scalar.toString(); // "1.25"
backToNumber.scalar; // 1.25
backToNumber.units(); // "km/h"
```

This preserves the units and adopts the destination class's numeric, parser, and cache settings. The destination's precision and range limits apply; changing backends cannot recover precision already lost in the source.

Do not mix incompatible backends directly in arithmetic or comparisons. Convert the operand first, for example `decimal.add(new Quantity(native))`. Quantities with compatible numeric backends can use different settings; arithmetic uses the receiving quantity's settings.

Plain definitions are different from Quantity instances: their `scalar` must already be a value of the destination backend's type. Use a Decimal for a Decimal quantity and a number for a number quantity.

## Combine a backend and parser

Use `createQuantityClass()` when a preset does not provide the combination you need. For example, JavaScript numbers with Regex:

```ts
import { createQuantityClass } from '@neutrium/quantity/factory';
import { RegexParser } from '@neutrium/quantity/parsers/regex';
import { NumberAdapter } from '@neutrium/utilities/number';

const NumberRegexQuantity = createQuantityClass({
    numeric: new NumberAdapter(),
    parser: config => new RegexParser(config),
});

new NumberRegexQuantity('2 km').to('m').scalar; // 2000
```

The factory also accepts `DecimalArithmeticAdapter` from `@neutrium/utilities/decimal/arithmetic` and custom `ArithmeticAdapter<T>` implementations. An arithmetic-only adapter supports Quantity's integer powers; Nearley expressions with fractional scalar powers, such as `(4)^0.5`, need a scientific adapter. Powers involving units always require safe integers.

Custom backends must supply immutable values and settings, and their numerical behavior depends on their adapter. Configuration options are available only if the adapter supports them. The factory infers the scalar type and configuration options from the adapter; a `Quantity<T>` type annotation alone does not select a runtime backend.

When bundling, the number preset excludes Decimal, and the Regex preset excludes Nearley and Moo. The factory lets you combine both exclusions by selecting numbers and Regex as above. npm still installs the package's declared dependencies.

For custom parser integration and direct parser calls, see [parsers and definitions](parsers.md). For older factory imports and configuration formats, see [Migrating to version 6](migrating-v6.md).
