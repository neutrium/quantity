# Numeric backends

A numeric backend determines how Quantity stores scalar values and performs calculations. The default uses Decimal arithmetic. Choose JavaScript numbers when
ordinary floating-point behavior suits your application, or configure another backend through the factory.

## Choose a preset

| Import | Scalar type | Parser | When to use it |
| --- | --- | --- | --- |
| `@neutrium/quantity` | Decimal | Pratt | The default for configurable decimal precision and the full expression syntax. |
| `@neutrium/quantity/regex` | Decimal | Regex | Decimal calculations with simpler input syntax and a smaller parser bundle. |
| `@neutrium/quantity/number` | JavaScript `number` | Pratt | Native floating-point calculations and direct integration with number-based APIs. |

All three provide the same unit conversion, arithmetic, comparison, and temperature operations. Parser choice controls accepted expressions; it does not change the numeric representation. See the [parser guide](parsers.md) for syntax differences.

The Decimal presets use `DecimalScientificAdapter` from `@neutrium/math/adapters/decimal/scientific`. The number preset uses `NumberAdapter` from `@neutrium/math/adapters/number`. Each preset configures its adapter automatically.

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

The number backend uses JavaScript binary64 arithmetic throughout scalar calculations. A custom adapter also uses its own arithmetic when calculating a result unless it supplies both rational extraction and construction. Intermediate rounding, overflow and underflow follow that adapter, including when converting temperatures.

With rational extraction and construction, Quantity supplies the scaled terms to the receiving adapter for final rounding. For example, Math’s BigInt adapter truncates the completed difference in `1 m − 50 cm` to `0 m`, and converts `9 tempR` to `5 tempK`. When constructing a BigInt quantity from a Decimal quantity, the receiving adapter also truncates the transferred rational value. BigInt still requires integral input for direct numeric literals. An adapter needs to accept the fractional offset literal to construct Celsius and Fahrenheit quantities.

Exact cross-unit comparison uses the adapter’s rational extraction and comparison methods. Other adapters compare converted scalars at their own precision. Scientific and arithmetic Decimal adapters offer the same rounding guarantees for shared operations at the same precision. The scientific tier adds operations. You can pair the smaller Decimal tier with the default Pratt parser through the factory.

```ts
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { createQuantityClass } from '@neutrium/quantity/factory';
import { PrattParser } from '@neutrium/quantity/parsers/pratt';

const Q = createQuantityClass({
    numeric: new DecimalArithmeticAdapter({ precision: 30 }),
    parser: config => new PrattParser(config),
});
new Q('1 m').sub('50 cm').scalar.toString(); // "0.5"
```

Scalar roots and rational powers also work with arithmetic adapters that provide
extraction and construction, including `DecimalArithmeticAdapter`. Scientific
methods are used only by Math's fallback for adapters without both capabilities.
