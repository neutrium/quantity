# @neutrium/quantity

Represent measured values with decimal scalars, convert units, and perform arithmetic while tracking dimensions. Requires Node.js 24 or newer; browser applications need an ESM-compatible bundler.

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

Try the [interactive Quantity Lab](https://neutrium.github.io/quantity/demo/) to explore conversions, arithmetic, and temperatures in your browser.

## Start here

- [Working with quantities](usage.md): inputs, decimal values, conversions, arithmetic, and comparisons.
- [Temperatures](temperatures.md): absolute temperatures, intervals, and permitted operations.
- [Parsers and definitions](parsers.md): choosing a parser, adapting input, and checking results.
- [Migrating to version 5](migrating-v5.md): counted definitions and changed runtime contracts.
- [Benchmarks](benchmarks.md): workloads, measurements, and reproduction commands.

## API entry points

| Import | Exports | Purpose |
| --- | --- | --- |
| `@neutrium/quantity` | {@link Quantity.Quantity | Quantity} | Construct, convert, and calculate quantities. |
| `@neutrium/quantity/regex` | {@link regex.Quantity | Quantity} | Construct quantities with Regex and exclude Nearley from bundles. |
| `@neutrium/quantity/core` | {@link core.QuantityCore | QuantityCore}, {@link core.createQuantityClass | createQuantityClass}, supporting types | Configure a parser without importing a built-in parser. |
| `@neutrium/quantity/parsers/nearley` | {@link parsers.NearleyQtyParser | NearleyQtyParser}, {@link parsers.QuantityParseError | QuantityParseError}, error/result and configuration types | Rich expressions and structured diagnostics. |
| `@neutrium/quantity/parsers/regex` | {@link parsers.RegexQtyParser | RegexQtyParser}, configuration types | Direct Regex import without Nearley. |
| `@neutrium/quantity/parsers.js` | {@link parsers.NearleyQtyParser | NearleyQtyParser}, {@link parsers.RegexQtyParser | RegexQtyParser} | Parse scalar and unit expressions. |
| `@neutrium/quantity/guards.js` | {@link guards.isQuantity | isQuantity}, {@link guards.isQuantityDefinition | isQuantityDefinition}, {@link guards.QuantityInitParam | QuantityInitParam} | Inspect inputs and describe their TypeScript shape. |

{@link QuantityDefinition.QuantityDefinition | QuantityDefinition}, {@link QuantityDefinition.UnitPower | UnitPower}, and {@link "parsers/Parser".Parser | Parser} are exported as types from `@neutrium/quantity/core`. See [Migrating to version 5](./migrating-v5.md) for the counted definition format.

## Common tasks

| Task | API |
| --- | --- |
| Read the numerical value or unit expression | {@link Quantity.Quantity.scalar | Quantity.scalar}, {@link Quantity.Quantity.units | Quantity.units} |
| Convert to chosen units or base units | {@link Quantity.Quantity.to | Quantity.to}, {@link Quantity.Quantity.toBase | Quantity.toBase} |
| Add, subtract, multiply, or divide | {@link Quantity.Quantity.add | Quantity.add}, {@link Quantity.Quantity.sub | Quantity.sub}, {@link Quantity.Quantity.mul | Quantity.mul}, {@link Quantity.Quantity.div | Quantity.div} |
| Compare equivalent measurements | {@link Quantity.Quantity.eq | Quantity.eq}, {@link Quantity.Quantity.compareTo | Quantity.compareTo} |
| Check dimensions before an operation | {@link Quantity.Quantity.isCompatible | Quantity.isCompatible} |
| Distinguish temperature intervals from absolute temperatures | {@link Quantity.Quantity.isTemperature | Quantity.isTemperature}, {@link Quantity.Quantity.isDegrees | Quantity.isDegrees} |

Quantity values are getter-only and their counted unit records and arrays are frozen. Use arithmetic or construction to obtain new values. Configuration is also immutable; use `Quantity.withConfig()` for an isolated numerical context and cache budgets.

For the supported unit categories, prefixes, and naming conventions, see the [package README](https://github.com/neutrium/quantity#unit-specification).
