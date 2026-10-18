# @neutrium/quantity

Represent measured values with Decimal, JavaScript numbers or custom scalars, convert units, and perform arithmetic while tracking dimensions. Requires Node.js 24 or newer; browser applications need an ESM-compatible bundler.

[Interactive demo](https://neutrium.github.io/quantity/demo/) · [API reference](https://neutrium.github.io/quantity/)

## Getting Started

```sh
npm install @neutrium/quantity
```

```ts
import { Quantity } from '@neutrium/quantity';

const distance = new Quantity('150 km');
const duration = new Quantity('2 h');
const speed = distance.div(duration).to('km/h');

speed.scalar.toString(); // "75"
speed.units(); // "km/h"
```


## Feature Guides

- [Working with quantities](usage.md): inputs, scalar values, conversions, arithmetic, and comparisons.
- [Numeric backends](numeric-backends.md): Decimal, JavaScript doubles, custom adapters and tree shaking.
- [Temperatures](temperatures.md): absolute temperatures, intervals, and permitted operations.
- [Parsers and definitions](parsers.md): choosing a parser, adapting input, and checking results.
- [Migrating to version 6](migrating-v6.md): utilities adapters, parser interfaces and nested configuration.
- [Migrating from version 4 to version 5](migrating-v5.md): counted definitions and changed runtime contracts.
- [Benchmarks](benchmarks.md): workloads, measurements, and reproduction commands.

## API entry points

| Import | Exports | Purpose |
| --- | --- | --- |
| `@neutrium/quantity` | {@link Quantity.Quantity | Quantity} | Construct, convert, and calculate quantities. |
| `@neutrium/quantity/number` | {@link number.Quantity | Quantity} | JavaScript doubles with Nearley; excludes Decimal from runtime bundles. |
| `@neutrium/quantity/regex` | {@link regex.Quantity | Quantity} | Construct quantities with Regex and exclude Nearley from bundles. |
| `@neutrium/quantity/factory` | {@link factory.Quantity | Quantity}, {@link factory.createQuantityClass | createQuantityClass}, supporting types | Select a utilities numeric adapter and parser. |
| `@neutrium/quantity/parsers/nearley` | {@link parsers.NearleyParser | NearleyParser}, {@link parsers.QuantityParseError | QuantityParseError}, error/result and configuration types | Rich expressions and structured diagnostics. |
| `@neutrium/quantity/parsers/regex` | {@link parsers.RegexParser | RegexParser}, configuration types | Direct Regex import without Nearley. |
| `@neutrium/quantity/parsers.js` | {@link parsers.NearleyParser | NearleyParser}, {@link parsers.RegexParser | RegexParser} | Parse scalar and unit expressions. |
| `@neutrium/quantity/guards.js` | {@link guards.isQuantity | isQuantity}, {@link guards.isQuantityDefinition | isQuantityDefinition} | Inspect quantities and validate definitions. |

{@link QuantityDefinition.QuantityDefinition | QuantityDefinition}, {@link QuantityDefinition.UnitPower | UnitPower}, {@link factory.QuantityInput | QuantityInput}, and {@link "parsers/Parser".Parser | Parser} are exported as types from `@neutrium/quantity/factory`. See [Migrating to version 5](./migrating-v5.md) for the counted definition format.

## Common tasks

| Task | API |
| --- | --- |
| Read the numerical value or unit expression | {@link factory.Quantity.scalar | Quantity.scalar}, {@link factory.Quantity.units | Quantity.units} |
| Convert to chosen units or base units | {@link factory.Quantity.to | Quantity.to}, {@link factory.Quantity.toBase | Quantity.toBase} |
| Add, subtract, multiply, or divide | {@link factory.Quantity.add | Quantity.add}, {@link factory.Quantity.sub | Quantity.sub}, {@link factory.Quantity.mul | Quantity.mul}, {@link factory.Quantity.div | Quantity.div} |
| Compare equivalent measurements | {@link factory.Quantity.eq | Quantity.eq}, {@link factory.Quantity.compareTo | Quantity.compareTo} |
| Check dimensions before an operation | {@link factory.Quantity.isCompatible | Quantity.isCompatible} |
| Distinguish temperature intervals from absolute temperatures | {@link factory.Quantity.isTemperature | Quantity.isTemperature}, {@link factory.Quantity.isDegrees | Quantity.isDegrees} |

Quantity values are getter-only and their counted unit records and arrays are frozen. Use arithmetic or construction to obtain new values. Configuration is also immutable; use `Quantity.withConfig()` for an isolated numerical context and cache budgets.

For the supported unit categories, prefixes, and naming conventions, see the [package README](https://github.com/neutrium/quantity#unit-specification).
