# Temperatures

An absolute temperature is a point on a scale; a temperature interval is a change in temperature. Use `tempC`, `tempF`, `tempK`, or `tempR` for absolute values and `degC`, `degF`, `degK`, or `degR` for intervals. Bare `C`, `F`, `K`, and `R` unit names resolve to degrees.

```ts
import { Quantity } from '@neutrium/quantity';

new Quantity('0 tempC').to('tempK').scalar.toString(); // "273.15"
new Quantity('10 degC').to('degK').scalar.toString(); // "10"
```

Absolute temperatures and intervals share a dimensional signature, so {@link factory.Quantity.isCompatible | Quantity.isCompatible} alone does not distinguish them. Absolute-to-absolute conversions apply offsets. Converting an absolute value to interval units instead treats its displayed reading as an interval in that scale, without applying the absolute-temperature offset:

```ts
const room = new Quantity('20 tempC');
room.to('tempK').scalar.toString(); // "293.15"
room.to('degC').scalar.toString(); // "20"
room.to('mdegC').scalar.toString(); // "20000"
```

Choose the target kind deliberately; converting to interval units is not a way to calculate the difference between two absolute temperatures. Use subtraction for that.

## Identify the kind of temperature

{@link factory.Quantity.isTemperature | Quantity.isTemperature} identifies absolute temperatures. {@link factory.Quantity.isDegrees | Quantity.isDegrees} is broader: it returns true for both absolute temperatures and standalone, unprefixed intervals. To identify an unprefixed interval:

```ts
const interval = new Quantity('10 degC');
interval.isDegrees() && !interval.isTemperature(); // true

const absolute = new Quantity('20 tempC');
absolute.isDegrees(); // true
absolute.isTemperature(); // true
```

`isDegrees()` is a structural check, not a general dimensional test: prefixed intervals such as `mdegC` and compound expressions such as `degC*m/m` return false. Use `isCompatible('degK')` to check temperature dimensions, and `isTemperature()` to identify a standalone absolute temperature.

## Arithmetic rules

| Operation                           | Result                                               |
| ----------------------------------- | ---------------------------------------------------- |
| Absolute + interval                 | Absolute temperature                                 |
| Interval + absolute                 | Absolute temperature                                 |
| Absolute − interval                 | Absolute temperature                                 |
| Absolute − absolute                 | Interval in the left operand's degree scale          |
| Absolute + absolute                 | Throws                                               |
| Interval − absolute                 | Throws                                               |
| Absolute × or ÷ unitless scalar     | Scales the numeric reading; result must remain valid |
| Absolute × a quantity with units    | Throws                                               |
| Division by an absolute temperature | Throws                                               |

```ts
const room = new Quantity('20 tempC');
room.add('5 degC').scalar.toString(); // "25"
room.sub('15 tempC').scalar.toString(); // "5"
room.sub('15 tempC').units(); // "degC"
```

Scaling an absolute temperature operates on its displayed reading, not on its kelvin value. For example, `new Quantity('20 tempC').mul(2)` produces `40 tempC`. Convert to `tempK` first if the intended calculation scales a kelvin value.

When compatible numeric contexts represent absolute zero differently, arithmetic validates against the temperature operand's own boundary, then expresses the result using the receiver's boundary. This also applies to `interval.add(temperature)` and `unitless.mul(temperature)`: the result retains the left operand's class and numeric settings. Multiplication scales the source reading before translating the boundary; rounding and range limits follow the receiver's backend.

Absolute temperatures below absolute zero throw. Absolute-temperature units cannot appear in compound expressions such as `tempC/m` or `m/tempC`; use intervals such as `degC/m` for gradients. Inversion of an absolute temperature also throws.

## Precision and absolute zero

Temperature rules are backend-independent and use utilities’ numeric adapters. A valid conversion that underflows to zero kelvin returns absolute zero in the target scale: `0 tempK`, `0 tempR`, `-273.15 tempC`, or `-459.67 tempF`, provided that boundary is representable by the backend. Conversion rounding that would put a valid result below that boundary is clamped instead of throwing. Decimal interval shifts and scalar multiplication/division receive the same boundary protection; native and custom results are checked in their own representation.

Below-zero inputs and cooling past absolute zero remain errors. Decimal validation uses the complete unrounded result, so intermediate rounding cannot hide an invalid result or reject a valid one. Decimal cross-unit comparisons include exact catalog scales and temperature offsets before deciding their ordering. Decimal precision and range are applied when producing the final scalar. Native and custom adapters instead perform these calculations and comparisons in their selected representation, including intermediate rounding and range limits. Negative intervals and cooling directly from the boundary are rejected before conversion underflow.

With Decimal adapters, temperature offsets are evaluated outside the configured scalar exponent range. For example, with `maxE: 1`, `1 tempC` converts to `33.8 tempF`, even though the Kelvin intermediate would overflow. Positive overflow still produces `Infinity`, and valid underflow returns absolute zero when its reading is representable in the target scale. A physically valid result that would require a negative-infinite reading or an unrepresentable absolute-zero boundary throws `RangeError`. For example, converting `0 tempK` or `1 tempK` to `tempC` with `maxE: 1` throws; increasing `maxE` to at least `2` permits those readings. Raising an absolute temperature to power one preserves its reading exactly.

Negative-infinite absolute-temperature inputs are always rejected, including finite literals that overflow while being read. An overflowed boundary is never treated as equal to such an input: `-300 tempC` and `-500 tempF` remain invalid with `maxE: 1`. Public construction and copying validate the represented scalar after applying the destination range, so even a physically valid input such as `-200 tempC` cannot be stored in that narrow range. Finite readings are checked against the exact offset when the Decimal boundary itself is outside the range.

```ts
const Limited = Quantity.withConfig({ numeric: { maxE: 1, minE: -20 } });
new Limited('1 tempC').to('tempF').scalar.toString(); // "33.8"
new Limited('1e-20 mdegK').to('tempK').scalar.toString(); // "0"

try
{
    new Limited('0 tempK').to('tempC');
}
catch (error)
{
    error instanceof RangeError; // true: -273.15 cannot fit this range
}
```
