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

To calculate the interval between two absolute temperatures, subtract one from the other. A conversion target supplies only its units, so passing a quantity with units `tempC` has the same effect as passing `'tempC'`.

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

Copying an absolute temperature into a class with a different backend preserves its distance from the source scale’s represented absolute zero, subject to destination precision and range. For example, copying a float32 Fahrenheit reading at absolute zero into a Decimal quantity produces `-459.67 tempF`. Passing the scalar and units separately supplies a new reading directly on the destination scale.

When an interval compares a temperature from another compatible numeric context, `interval.compareTo(point)` gives the same result as `interval.compareTo(new Receiver(point))`, where `Receiver` is the interval’s quantity class. The same conversion errors apply if the receiver cannot represent the point.

When compatible numeric contexts represent absolute zero differently, arithmetic validates against the temperature operand's own boundary, then expresses the result using the receiver's boundary. This also applies to `interval.add(temperature)` and `unitless.mul(temperature)`: the result retains the left operand's class and numeric settings. Multiplication scales the source reading before translating the boundary; rounding and range limits follow the receiver's backend.

Absolute temperatures below absolute zero throw. Absolute-temperature units cannot appear in compound expressions such as `tempC/m` or `m/tempC`; use intervals such as `degC/m` for gradients. Inversion of an absolute temperature also throws.

## Precision and absolute zero

Temperature rules are backend-independent and use math’s numeric adapters. A valid conversion that underflows to zero kelvin returns absolute zero in the target scale: `0 tempK`, `0 tempR`, `-273.15 tempC`, or `-459.67 tempF`, provided that boundary is representable by the backend. Conversion rounding that would put a valid result below that boundary is clamped instead of throwing. Decimal interval shifts and scalar multiplication/division receive the same boundary protection; native and custom results are checked in their own representation.

An input below absolute zero is invalid. Quantity applies the source scale’s represented boundary and preserves physical absolute zero when transferring between scales or contexts. Exact-capable adapters compare rational terms and round the completed conversion. Other adapters apply the scale factors and offsets in their own arithmetic. An intermediate can overflow even when the final reading would fit. An unrepresentable negative result can raise a range error. Negative intervals used as absolute values and cooling directly from absolute zero are rejected.

An offset can exceed the adapter’s exponent range while both the input and output readings fit. For example, with `maxE: 1`, `1 tempC` converts to `33.8 tempF`, even though the Kelvin intermediate would overflow. Positive overflow still produces `Infinity`, and valid underflow returns absolute zero when its reading is representable in the target scale. A physically valid result that would require a negative-infinite reading or an unrepresentable absolute-zero boundary throws `RangeError`. For example, converting `0 tempK` or `1 tempK` to `tempC` with `maxE: 1` throws; increasing `maxE` to at least `2` permits those readings. Raising an absolute temperature to power one preserves its reading exactly.

Negative-infinite absolute-temperature inputs are always rejected, including finite literals that overflow while being read. An overflowed boundary is never treated as equal to such an input: `-300 tempC` and `-500 tempF` remain invalid with `maxE: 1`. Public construction and copying validate the represented scalar after applying the destination range, so even a physically valid input such as `-200 tempC` cannot be stored in that narrow range. Adapters with rational extraction and comparison can check finite readings against the catalog offset even when the boundary itself overflows.

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
