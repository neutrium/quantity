# Migrating to version 5

This guide covers the counted-unit changes introduced in version 5. Examples use the current API. For the factory, parser and configuration changes from version 5 to version 6, see [Migrating to version 6](migrating-v6.md).

## Counted definitions

`QuantityDefinition.numerator` and `.denominator`, the corresponding Quantity
fields, and parser results now contain `UnitPower`
records instead of repeated strings. Import both types from
`@neutrium/quantity/factory`.

```ts
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import type { QuantityDefinition, UnitPower } from '@neutrium/quantity/factory';

const areaUnit: UnitPower = {
    unit: '<meter>',
    prefix: '<kilo>',
    exponent: 2
};
const definition: QuantityDefinition = {
    scalar: new Decimal(3),
    numerator: [areaUnit],
    denominator: []
};
const area = new Quantity(definition);
area.units(); // "km2"
area.to('m2').scalar.toString(); // "3000000"
```

Convert old definitions as follows:

| Version 4 side | Version 5 side |
| --- | --- |
| `['<meter>', '<meter>']` | `[{ unit: '<meter>', exponent: 2 }]` |
| `['<kilo>', '<meter>', '<kilo>', '<meter>']` | `[{ unit: '<meter>', prefix: '<kilo>', exponent: 2 }]` |
| `['<1>']` | `[]` |

A prefix belongs to its unit record and is included in the power. For negative powers, put the record in the denominator with a positive exponent. Remove zero-exponent records. Update custom parsers and persisted definitions to this shape; legacy string arrays are rejected. Bundled parsers already return it.

Construction coalesces repeated records on each side, copies external records, and freezes the resulting records and arrays. It never mutates a parser's result. Copies and arithmetic results can safely share these immutable arrays. Use new definitions to change values or units. `scalar`, `signature`, `baseScalar`, `numerator`, `denominator`, and `initValue` are now getter-only in TypeScript and JavaScript; assignments throw in strict mode. The public `baseScalar` setter has been removed. These getters are not enumerable own properties; when exporting a definition, explicitly select `{ scalar: qty.scalar, numerator: qty.numerator, denominator: qty.denominator }` instead of spreading the instance.

Numerical base values are calculated on first access rather than during construction. Unit validation, dimensional overflow checks, and absolute-zero validation still happen immediately. Subsequent reads reuse the cached value when metadata caching is enabled.

For Quantity and definition inputs, `initValue` now holds a normalized snapshot of `scalar`, `numerator`, and `denominator`, rather than retaining the input object. This snapshot is frozen. This prevents repeated copies from retaining earlier quantities and their caches. Extra properties on input definitions are not copied. String, number, and Decimal inputs retain their original `initValue`; non-native numeric `toString()` objects instead retain their parsed backend scalar snapshot. Clones preserve their configured parser.

Parsing preserves numerator and denominator separately: `m/m` retains both sides. Multiplication, division, and powers cancel matching unit/prefix pairs. Distinct prefixes remain distinct until converted; `km/m` has a conversion factor of 1000. Resolving scaled or derived units with `toBase()` also cancels matching base terms. Quantities already in base units still return themselves.

With the default Decimal backend, unit conversions and cross-unit arithmetic cancel catalog factors before evaluation and apply output precision and range limits only to the final result of each operation. Converted operands are not rounded separately. Cross-unit comparisons use unrounded values. Same-unit and scalar arithmetic use the selected utilities adapter directly. Integer powers use the selected backend; both Decimal tiers apply final-only rounding and range limits. The default is an isolated scientific Decimal adapter; global `Decimal.config` changes no longer affect existing Quantity classes. See [numeric backends](numeric-backends.md) for factory selection and breaking API changes.

Conversion caches, unchanged-unit checks, and `same()` compare unit tokens, prefixes, exponents, and numerator/denominator placement, preserving term order. They do not use display aliases as identity: the historical `min`/`milliinch` formatting collision cannot make time and length compatible. Use `eq()` to compare equivalent physical values expressed with different unit records.

## Comparison and guard contracts

`eq`, `lt`, `lte`, `gt`, `gte`, and `compareTo` now support numbers and Decimal values at runtime and in TypeScript, in addition to strings and Quantity instances. Numeric values use the receiver's current units: `new Quantity('100 cm').eq(100)` is true, while `.eq(1)` is false. Use `.eq('1 m')` for explicit unit conversion. Numeric comparisons use the scalar directly, without parsing or creating a temporary Quantity. String operands keep their quantity-expression semantics. Invalid runtime operands receive an explicit TypeError. `same()` still requires a Quantity, and `isCompatible(number)` continues to return false.

`compareTo()` now declares its existing unordered result: `-1 | 0 | 1 | undefined`. Handle `undefined` when NaN is possible; boolean comparisons return false for unordered values.

`isQuantityDefinition(value, numeric)` now validates backend scalars, counted arrays, registered tokens, and safe counts. It returns false for nullish or malformed inputs rather than throwing or accepting incomplete objects. It does not mutate the input, and physical temperature restrictions remain constructor checks. Definition and parser scalars must satisfy the selected adapter’s `isValue` check.

## Removed `toBaseUnits()` helper

Use `qty.toBase()` to convert an existing quantity. To obtain the base-unit factor for supplied counted units, construct a quantity with scalar `1` and call `toBase()`:

```ts
const factor = new Quantity({
    scalar: new Decimal(1),
    numerator: [{ unit: '<meter>', prefix: '<centi>', exponent: 1 }],
    denominator: []
}).toBase();
factor.scalar.toString(); // "0.01"
factor.units(); // "m"
```

Use your configured Quantity class when numerical settings must be preserved. For absolute temperatures, `toBase()` applies the temperature offset; use interval units such as `degC` or `degF` when you need only a scale factor. Quantities already in base units return themselves, so `toBase()` is not a general unit-cancellation operation.

## Conversion targets

`.to()` now ignores the target scalar for both strings and Quantity arguments. Previously, a scalar in a string could divide the result for changed units, while unchanged units and temperature conversions ignored it. For example, `new Quantity('1000 cm').to('2 m')` now returns `10 m`, consistently with
`new Quantity('10 m').to('2 m')`. A target of `0 cm` or `-2 cm` behaves like `cm`. Target syntax and unit compatibility are still validated.

Equivalent unit targets share cached results, independent of their ignored scalar or alias spelling. Per-source result and string-lookup caches each default to 1,024 entries and a 4 MiB estimated-byte budget; in version 6, override these with `cache: { conversionResults: { maxEntries, maxBytes } }`. The former `conversionCache` option is rejected. Shared parser, base-unit, and alias caches evict the least recently used entry instead of periodically clearing all entries. Object identity of a conversion result is not guaranteed across eviction.

If you used scaled targets to calculate a ratio, replace `.to('2 m')` with `.div('2 m')`; `new Quantity('10 m').div('2 m')` returns the unitless quantity `5`.

## Unit expression formatting

Nonempty `units()` expressions can be parsed by either bundled parser without changing their unit records. Compound denominators use tightly coupled dot multiplication: `kg/m/s` is formatted as `kg/m.s`, meaning `kg/(m*s)`. Reciprocals are formatted as `1/m` or `1/m.s`. Both parsers still accept repeated division as input. Numerator products still use `*`. Update snapshots or stored display strings that depend on repeated `/` separators.

Both parsers now use the same precedence: powers first, tightly coupled dot multiplication second, then ordinary multiplication (`*` or whitespace) and division from left to right. Previously Regex treated products following a slash as part of the denominator. For example, `m/s*kg` and `m/s kg` previously meant
`m/(s*kg)` in Regex; they now mean `(m/s)*kg` in both parsers. Use `m/s/kg` or `m/s.kg` if both units belong in the denominator.

Dot multiplication now binds more tightly than division in Nearley as well: `kg/m.s` means `kg/(m*s)`, whereas `kg/m*s` means `(kg/m)*s`. Update Nearley inputs that used a dot after division to mean ordinary multiplication by replacing that dot with `*`. Formatting uses `*` for numerator products and tightly coupled `.` for denominator products, following these same precedence rules.

Nearley now accepts reciprocal quantities such as `2/s` and `1e3/s` directly, and parenthesized unit groups such as `(m/s)` and `m/(s*kg)` no longer require the `^1` workaround. Existing explicit powers continue to work. Nested unit groups and reciprocals, such as `2/(1/s)`, follow the same precedence rules.

Output aliases must resolve back to the original token and prefix. Electrical units therefore print as `farad` and `coulomb`, and radiation exposure prints as `roentgen`. Existing input aliases `F`, `C`, and `R` retain their temperature meanings; temperature output remains `degF`, `degC`, and `degR`. Prefix collisions are also avoided: a milli-inch prints as `m"`, while a minute prints as `min`. Update snapshots or stored display strings that depend on the old formatting.

Nearley now resolves complete prefixed unit spellings, fixing inputs such as `minch` (milli-inch), `kilogram-force`, and `Gy(j)` (giga-Julian-years). Exact aliases still take priority: `min` remains minute and `Gy` remains gray. Established formatted spellings are retained, including `m"` for milli-inch.

Unitless quantities still return an empty string from `units()`; use `"1"` when parsing that unit expression on its own. Custom parsers may have their own syntax and are not required to accept the bundled parsers' output format.

## Large powers and limits

Unit storage and dimensional operations scale with the number of distinct unit/prefix pairs, rather than the magnitude of each power. `m1000000` uses one record. Nested powers multiply counters; base conversion multiplies the catalog's base-unit counts and evaluates the corresponding conversion factors with the selected backend. The unit catalog's small fixed arrays are not expanded by user exponents.

Every exponent, combined count, and dimension count must be a safe integer (no larger in magnitude than `Number.MAX_SAFE_INTEGER`). Overflow throws `RangeError` before rounded counts can silently corrupt dimensions. This also applies to intermediate counts and base expansion: a very large power of `N`
can overflow its doubled seconds exponent even when the input exponent fits. `Quantity.pow()` accepts integer Decimal, string, or number arguments within the same range. Zero produces a dimensionless identity.

Scalar arithmetic still follows Decimal's precision and numeric range; counted units do not make arbitrary scalar calculations exact or constant-time. Each bundled parser configuration retains at most 1,024 plans and 4 MiB of estimated payload by default. Eviction removes the least recently used entries; the cache is not cleared wholesale when full. Per-quantity conversion caches have independent entry and byte limits. Shared base-unit and output-alias caches also use bounded least-recently-used eviction. Formatted unit-side strings use weak keys so they do not keep unused definitions alive. See [cache configuration](usage.md#configuration) for budgets and scope.

## Other observable changes

- Absolute-temperature conversions to prefixed or compound intervals now use the same offset-free source reading as standalone degree conversions. For example, `20 tempC` converts to `20000 mdegC`, matching conversion through `degC`; previously the direct prefixed conversion incorrectly used absolute kelvin and returned `293150`. Absolute-temperature conversions retain their offsets.
- `isInverse()` now compares dimensions directly, ignoring scalar values. Zero quantities no longer cause this predicate to throw. Absolute temperatures can have reciprocal dimensions, but actual inversion and reciprocal conversion still reject them. Invalid string operands still throw parsing errors.
- Farads use the catalog's derived SI dimensions, `A2*s4/kg/m2`, for both prefixed and unprefixed units. `new Quantity('farad').isBase()` now returns false, and `toBase()` expands those dimensions. Farads, millifarads, and coulombs per volt are compatible for conversion and arithmetic.
- `signature` is now an opaque string containing the full dimensional vector, rather than a number. Use `isCompatible()` to compare dimensions. The previous radix-20 encoding could incorrectly equate `m20` with `s`.
- Nearley now throws for incomplete expressions such as `m/` instead of returning `undefined` despite its declared return type. Handle parser errors with `try`/`catch`.
- Regex reads powers directly, including `**` notation and signed powers in the denominator. Unknown units and incomplete powers are rejected even for zero exponents. It continues to support literal unit names such as `ton(l)` without supporting parenthesized expression groups.

## Continuing to version 6

Version 6 introduces utilities numeric adapters, renamed parser classes, the `/factory` entry point, and nested numeric/cache configuration. Follow [Migrating to version 6](migrating-v6.md) after updating counted definitions.
