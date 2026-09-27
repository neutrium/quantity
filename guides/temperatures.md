# Temperatures

An absolute temperature is a point on a scale; a temperature interval is a change in temperature. Use `tempC`, `tempF`, `tempK`, or `tempR` for absolute values and `degC`, `degF`, `degK`, or `degR` for intervals. Bare `C`, `F`, `K`, and `R` unit names resolve to degrees.

```ts
import { Quantity } from '@neutrium/quantity';

new Quantity('0 tempC').to('tempK').scalar.toString(); // "273.15"
new Quantity('10 degC').to('degK').scalar.toString(); // "10"
```

Absolute temperatures and intervals share a dimensional signature, so {@link Quantity.Quantity.isCompatible | Quantity.isCompatible} alone does not distinguish them. Absolute-to-absolute conversions apply offsets. Converting an absolute value to interval units instead treats its displayed reading as an
interval in that scale, without applying the absolute-temperature offset:

```ts
const room = new Quantity('20 tempC');
room.to('tempK').scalar.toString(); // "293.15"
room.to('degC').scalar.toString(); // "20"
room.to('mdegC').scalar.toString(); // "20000"
```

Choose the target kind deliberately; converting to interval units is not a way to calculate the difference between two absolute temperatures. Use subtraction for that.

## Identify the kind of temperature

{@link Quantity.Quantity.isTemperature | Quantity.isTemperature} identifies absolute temperatures. {@link Quantity.Quantity.isDegrees | Quantity.isDegrees} is broader: it returns true for both absolute  temperatures and standalone, unprefixed intervals. To identify an unprefixed interval:

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

Absolute temperatures below absolute zero throw. Absolute-temperature units cannot appear in compound expressions such as `tempC/m` or `m/tempC`; use intervals such as `degC/m` for gradients. Inversion of an absolute temperature also throws.


## Precision and absolute zero

Absolute-temperature conversions and differences combine offsets and scale factors before final rounding. A physically valid result that would round below absolute zero is clamped to the exact boundary (`-273.15 tempC` or `-459.67 tempF`), even if that requires more digits than the configured precision. An actually invalid source or result is rejected before rounding. Configured exponent limits still apply. See [configuration](usage.md#configuration) for isolated
settings and exact comparisons.
