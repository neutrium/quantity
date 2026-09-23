# Temperatures

An absolute temperature is a point on a scale; a temperature interval is a change in temperature. Use `tempC`, `tempF`, `tempK`, or `tempR` for absolute values and `degC`, `degF`, `degK`, or `degR` for intervals. Bare `C`, `F`, `K`, and `R` unit names resolve to degrees.

```ts
import { Quantity } from '@neutrium/quantity';

new Quantity('0 tempC').to('tempK').scalar.toString(); // "273.15"
new Quantity('10 degC').to('degK').scalar.toString(); // "10"
```

Keep absolute-to-absolute and interval-to-interval conversions separate in application code. They share a dimensional signature, so {@link Quantity.Quantity.isCompatible | Quantity.isCompatible} alone does not distinguish them.

## Identify the kind of temperature

{@link Quantity.Quantity.isTemperature | Quantity.isTemperature} identifies absolute temperatures. {@link Quantity.Quantity.isDegrees | Quantity.isDegrees} is broader: it returns true for both absolute temperatures and standalone intervals. To identify only an interval:

```ts
const interval = new Quantity('10 degC');
interval.isDegrees() && !interval.isTemperature(); // true

const absolute = new Quantity('20 tempC');
absolute.isDegrees(); // true
absolute.isTemperature(); // true
```

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
