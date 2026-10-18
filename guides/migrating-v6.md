# Migrating to version 6

Version 6 changes the factory, parser and configuration interfaces. The default remains scientific Decimal with Nearley, and Node.js 24 or newer is still required. The counted-unit format introduced in [version 5](migrating-v5.md) is unchanged.

## Factory and numeric backends

Replace the `/core` entry point with `/factory`. The factory now accepts an object containing a utilities numeric adapter and a parser factory, instead of a parser factory alone:

```ts
import { createQuantityClass } from '@neutrium/quantity/factory';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const decimalAdapter = new DecimalScientificAdapter();
import { NearleyParser } from '@neutrium/quantity/parsers/nearley';

const Q = createQuantityClass({
    numeric: decimalAdapter,
    parser: config => new NearleyParser(config),
    config: { numeric: { precision: 30 } },
});
```

Use `new NumberAdapter()` from `@neutrium/utilities/number` or a custom `ArithmeticAdapter<T>` to select another representation. The `/number` preset supplies JavaScript doubles with Nearley. Importing only the factory or native-number entry points allows a bundler to exclude Decimal. npm still installs declared dependencies.

The factory exports the generic `Quantity<T>`, `QuantityInput<T>`, `QuantityDefinition<T>` and `Parser<T>` types. Replace `QuantityCore`, `QuantityInitParam` and `QuantityConstructor` imports from `/core` with `Quantity<T>`, `QuantityInput<T>` and `NumericQuantityConstructor<T>` from `/factory`. Use the scalar representation as `T`. Prefer inferred constructor types when configuring an adapter so its configuration options remain available.

## Parser and guard interfaces

Rename `NearleyQtyParser` to `NearleyParser` and `RegexQtyParser` to `RegexParser`; their public entry paths remain `/parsers/nearley`, `/parsers/regex` and `/parsers.js`.

Custom parsers now implement `Parser<T>` for the scalar type, rather than `Parser<QuantityDefinition>`. `parse(text, numeric)` receives a utilities arithmetic adapter instead of a Decimal constructor. Use `numeric.from(text)` and its arithmetic methods to create scalars. Direct calls to bundled parsers must also supply the adapter:

```ts
const parsed = new NearleyParser().parse('2 m', decimalAdapter);
```

Parser wrappers delegating to a bundled parser should also forward the optional third argument so the receiver's cache policy is respected. See [parsers](parsers.md) for the wrapper contract.

`isQuantityDefinition(value, numeric)` now requires the selected adapter to validate its scalar. `isQuantity` recognizes quantities using any backend. Numeric settings and values must be immutable; quantities using incompatible adapter implementations cannot be mixed implicitly in arithmetic or comparisons. Compatibility requires the same adapter instance, or shared `from` and `isValue` implementations with a scalar recognized by the receiving adapter; a diagnostic `id` is not a compatibility token. Use `new DestinationQuantity(sourceQuantity)` to convert explicitly to another backend while preserving units. Destination representation and range limits apply; this cannot recover precision lost in the source. See [numeric backends](numeric-backends.md) for the scalar conversion rules.

## Nested configuration and cache controls

Move numeric options under `numeric`, parser cache limits under `cache.parser`, and conversion cache limits under `cache.conversionResults`:

```ts
// Version 5
Quantity.withConfig({
    precision: 30,
    parser: { cache: { maxEntries: 256 } },
    conversionCache: { maxBytes: 1024 * 1024 },
});

// Version 6
Quantity.withConfig({
    numeric: { precision: 30 },
    cache: {
        parser: { maxEntries: 256 },
        conversionResults: { maxBytes: 1024 * 1024 },
    },
});
```

The former flat Quantity options are rejected. `Q.config` and `quantity.config` now expose the complete immutable `{ numeric, cache }` snapshot; replace `Q.config.precision` with `Q.config.numeric.precision`. The factory's optional `config` accepts the same shape as `withConfig`.

Numeric overrides are available only for configurable adapters. Direct utilities adapter settings and standalone parser constructor options retain their existing shapes.

Use `Q.withConfig({ cache: false })` to disable every optional library cache, or `cache: { parser: false }` to disable one family. Nested overrides inherit the parent's settings; `cache: true` restores all defaults, and a family-level `true` restores that family's defaults. Custom parser and backend internal caches remain their responsibility. See [configuration](usage.md#configuration) for every family and its limits.

Global `Decimal.config` changes no longer affect the preset classes. Configure the adapter or use `withConfig({ numeric: ... })`; derived results retain the receiver's class and settings.

## Dependency integration

Quantity requires Decimal 2.3.0 and Utilities 4.0.0 or compatible releases. Import numeric adapters from Utilities and pass an adapter instance to `createQuantityClass`; Quantity no longer provides its own adapter implementations. Use at least an arithmetic-tier adapter. For changes to adapter APIs, see [Utilities](https://github.com/neutrium/utilities).

## Numerical behavior

Float, double and custom backends now use their selected adapter throughout calculations, keeping intermediate scalars in the same representation without string/rational conversion. Their intermediate rounding, overflow and underflow follow the adapter. Utilities Decimal adapters retain rational intermediates and final-only rounding for conversion, cross-unit arithmetic and temperature calculations. Choose Decimal when that accuracy is required. Scientific adapters support fractional scalar powers in Nearley; arithmetic-tier adapters support integer powers. See [numeric backends](numeric-backends.md) for the numerical contract.

Valid temperature results that round or underflow below the represented absolute-zero boundary are clamped to that boundary. Invalid temperature operations and below-zero inputs still throw; native and custom results are validated at backend precision. Negative-infinite absolute-temperature inputs are rejected even when a narrow range also overflows the boundary. Valid calculations that cannot represent the final negative reading or absolute-zero boundary throw `RangeError`; valid underflow to a representable boundary still succeeds. Temperature `pow(1)` preserves the input reading, including absolute zero. See [temperature range handling](temperatures.md#precision-and-absolute-zero).

US liquid pint and quart aliases share exact catalog definitions with the US gallon and fluid ounce, based on [NIST Handbook 133, Appendix E](https://nvlpubs.nist.gov/nistpubs/hb/2023/NIST.HB.133-2023.pdf).

Roentgen now uses radiation-exposure dimensions (`A*s/kg`) and the exact factor `1 roentgen = 0.000258 coulomb/kg`, following [NIST's conversion table](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9). Previously it incorrectly shared dimensions with grays and sieverts. Conversions, addition and comparisons between roentgens and `Gy`, `Sv` or `J/kg` now throw for incompatible units. Use `roentgen` explicitly; `R` continues to mean `degR`.

```ts
new Quantity('1 roentgen').to('coulomb/kg').scalar.toString(); // "0.000258"
```

The electronvolt conversion uses the exact SI value `1 eV = 1.602176634e-19 J`, replacing the outdated `1.60217653e-19 J` constant. See [NIST's SI reference](https://www.nist.gov/system/files/documents/2019/12/10/nist_periodictable_july2019.pdf).
