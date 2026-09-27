# Parsers and definitions

## Overview

`@neutrium/quantity` provides two parser options:

- {@link parsers.NearleyQtyParser | NearleyQtyParser} is a robust, full featured unit parsser and is provided as the default parser.
- {@link parsers.RegexQtyParser | RegexQtyParser} is a fast, lightweight parser that supports a subset of the NearleyQtyParser expressions. Importing this via `@neutrium/quantity/regex` will drop the Nearly and Moo dependencies of the library.

## Expressions

Nearly supports compound expressions, integer powers, and nested parenthesized unit groups, such as `(m/s)` and `(m/s)^2`. {@link parsers.RegexQtyParser | RegexQtyParser} does not support parenthesized grouping. Regex's accepted string syntax is a subset of Nearley's: both parsers agree on shared unit spellings, prefixes, powers, precedence, and scalar values. Nearley adds richer expressions and diagnostics; Regex remains focused on speed and size.

Nearley accepts `**` as an alternative to `^` for unit, group, and scalar powers: `m**2`, `(m/s)**2`, and `2**3 m`. Whitespace may surround either power operator. It also accepts superscript integer powers (`m²`, `m⁻²`, `(m/s)²`, `2³ m`), middle-dot multiplication (`·` or `⋅`, with the same precedence as `.`), and `×` as an alternative to `*`. Unicode superscripts and multiplication signs are Nearley-only; Regex also accepts ASCII `**` powers. Formatted output continues to use ASCII. Superscripts attach directly to their base.

Nearley accepts scientific notation with integer or decimal mantissas, such as `1e3 m`, `-2E-3m`, and `.5e2 m`. Leading and trailing whitespace, repeated spaces, tabs, and newlines are accepted. Whitespace can separate multiplied units or surround `*`, `.`, `/`, and `^`, including inside powered groups:
`2e3 ( kg * m / s ) ^ -2`. Prefixes stay attached to units (`km`, not `k m`), and unit exponents remain safe integers (`m^2`, not `m^2.0` or `m^1e3`). Both parsers accept whitespace after a numeric sign, including `- 2 m` and `+ .5e2 m`.

Unit names are matched as complete spellings. Exact aliases take priority: `min` means minute and `kg` means kilogram. Otherwise, the parsers select the longest prefix that leaves a valid unit alias, so `minch` means milli-inch (`m` + `inch`). Longer partial matches cannot swallow the start of a unit.
Only one prefix is allowed, attached directly to the unit.

Both parsers apply powers first, then tightly coupled dot multiplication (`.`). Decimal unit exponents such as `m^2.1`, `m**-2.1` and `m2.1` are rejected by both parsers. A dot immediately followed by a digit is decimal syntax, not unit multiplication. Use `m^2*1` or `m^2 . 1` when multiplying by unity explicitly.
Ordinary multiplication (`*` or whitespace) and division (`/`) have lower, equal precedence and evaluate from left to right. Spaces around a dot do not change its precedence.

| Input           | Meaning             | Formatted units |
| --------------- | ------------------- | --------------- |
| `kg/m.s`        | `kg/(m*s)`          | `kg/m.s`        |
| `kg/m/s`        | `kg/(m*s)`          | `kg/m.s`        |
| `kg/m*s`        | `(kg/m)*s`          | `kg*s/m`        |
| `kg/m s`        | `(kg/m)*s`          | `kg*s/m`        |
| `kg/m.s*ampere` | `(kg/(m*s))*ampere` | `kg*A/m.s`      |
| `kg/m.s^2`      | `kg/(m*s^2)`        | `kg/m.s2`       |

Repeated division also expresses a compound denominator: `kg/m/s` means `kg/(m*s)`. Nearley additionally accepts explicit groups such as `kg/(m*s)`; an exponent after a group is optional. Regex does not support parenthesized groups.

A scalar can precede division directly: `2/s` means two per second, and `1e3/s` means one thousand per second in both parsers. Nearley also accepts grouped denominators such as `2/(m*s)` and nested reciprocals such as `2/(1/s)`. Both parsers accept `/s` as shorthand for `1/s`; Nearley additionally accepts bare grouped reciprocals such as `/(m*s)`. Dot precedence still applies: `2/m.s` means `2/(m*s)`, while `2/m*s` means
`(2/m)*s`.

Nearley additionally accepts scalar multiplication and division, including inside groups. Addition and subtraction are not expression operators. Whitespace is multiplication, so `2 3 m` means `6 m`, but a following signed factor requires an explicit operator: `2 -3 m` and `2 -(m)` are rejected; write `2 * -3 m` or `2 * -(m)`. A parenthesized signed number is also explicit: `m (-2)` is accepted. Leading signed numbers and signed exponents remain supported, including `-2 m`, `m^-2`, and compact `m-2`.

Unary signs apply to groups after their powers: `-(m/s)` negates the quantity, `-(2)^2` is `-4`, and `(-2)^2` is `4`. Signs attached to a number remain part of that numeric literal, so the existing `-2^2` spelling also evaluates to `4`.

| Input        | Meaning                                                |
| ------------ | ------------------------------------------------------ |
| `1/2 m`      | `(1/2)*m`, or `0.5 m`                                  |
| `m/2 s`      | `(m/2)*s`, or `0.5 m*s`                                |
| `m/(2 s)`    | `0.5 m/s`                                              |
| `1/2m`       | `1/(2*m)`; an adjacent scalar and unit form one factor |
| `(2 m/s)**2` | `4 m2/s2`                                              |

Use explicit operators or parentheses when scalar/unit adjacency could be unclear. Division by zero throws, including inside groups. Scalar arithmetic respects the current Decimal precision and evaluates in expression order; identity factors of one do not round an otherwise exact scalar. Pure scalar groups support decimal and scientific exponents just like scalar literals: `(4)^0.5` is `2` and `(2)^1e1` is `1024`. Any expression containing unit tokens keeps safe-integer exponent syntax, including `(m/m)^0.5` and `(m^0)^0.5`, which are rejected. Exponent literals bypass the quantity's input range limits: with `maxE: 0`, `(0.9 m)^10` still produces `0.3486784401 m10`. The configured precision, rounding, and exponent limits apply to the result of the power. Pass mixed scalar arithmetic as one expression string. The separate scalar/units constructor retains its existing contract: `new Quantity(2, 'm/2')` replaces the
parsed scalar with `2`; use `new Quantity('2 m/2')` to obtain `1 m`.

Choose the default or regex entry point at import time:

```ts
import { Quantity } from '@neutrium/quantity'; // Nearley
// Or: import { Quantity } from '@neutrium/quantity/regex';

const speed = new Quantity('12 m/s');
speed.scalar.toString(); // "12"
```

The regex entry point imports no Nearley runtime, grammar, or Moo lexer. The root entry imports no regex parser. These boundaries let bundlers exclude the unused parser; npm still installs the package's declared dependencies.

Both bundled parsers cache successful plans with default limits of 1,024 entries and 4 MiB of estimated retained memory per configuration scope. Changing the leading number reuses the plan: `2/3 m` and `5/3 m` share one entry, as do `2 (m/s)**2` and `3 (m/s)**2`. A plan contains immutable unit arrays and scalar operations, not a rounded scalar factor. Every call evaluates those operations in their original order under the current Decimal configuration and returns a fresh definition and scalar; frozen unit arrays can be shared. Nearley scalar powers remain part of the cached suffix (`2**3 m` and `5**3 m` share a plan).

Whitespace after the leading number and internal operator spellings remain part of the key. Scalar-led and bare expressions use separate entries. The cache evicts least recently used entries until both limits are satisfied. On a miss, Nearley continues the same lexer stream after inspecting the leading token, without rescanning the prefix.

## Configure parser memory

Pass numerical settings and parser limits together through `Quantity.withConfig()`:

```ts
const ConfiguredQuantity = Quantity.withConfig({
    precision: 30,
    parser: { cache: { maxEntries: 512, maxBytes: 1024 * 1024 } },
});
```

The same options work with the Regex entry point. Limits merge with the parent class's settings. Setting either cache limit to zero disables plan caching; oversized plans still parse but are not retained. The limit is an estimate for retained cache entries, including UTF-16 text, unit records, scalar instructions, and bookkeeping. It is not a limit on expression length, temporary parsing memory, fixed grammar/catalog structures, or Quantity's other caches.

Direct parser instances also accept these options and expose diagnostics:

```ts
import { NearleyQtyParser } from '@neutrium/quantity/parsers/nearley';

const parser = new NearleyQtyParser({ cache: { maxBytes: 1024 * 1024 } });
parser.parse('2 kg/m.s');
parser.config.cache.maxBytes; // 1048576
parser.cacheStats.entries; // 1
parser.cacheStats.estimatedBytes; // estimated retained memory
parser.clearCache(); // clears this configuration's shared plan cache
```

No-argument parser instances share the default cache. Passing an options object creates an isolated scope; pass `parser.config` to another parser of the same type to explicitly share that scope. Quantity passes its frozen `parserConfig` snapshot to all default parsers in the class, so its budget is not multiplied by the number of quantities. Independently configured classes have independent budgets. Cache
registries use weak keys, allowing unused configuration scopes to be collected. Regex `initialize()` rebuilds shared patterns and invalidates all Regex plan scopes.

## Handle parsing errors

Nearley throws `QuantityParseError`, exported from `/parsers/nearley` and `/parsers.js`. Regex throws ordinary errors; its class has no `tryParse()` method and `/parsers/regex` does not export `QuantityParseError`. Its `code`, `input`, `offset`, `line`, `column`, and `expected` properties support
form validation. Offsets are zero-based UTF-16 indices in the original input; line and column are one-based. The message includes the source line and a caret. Codes include `UNKNOWN_UNIT`, `UNEXPECTED_TOKEN`, `UNEXPECTED_END`, `INVALID_EXPONENT`, `DIVISION_BY_ZERO`, `INVALID_SCALAR`, `INVALID_INPUT`, and `AMBIGUOUS_EXPRESSION`. Expected-token hints are available for syntax failures.

```ts
import { NearleyQtyParser, QuantityParseError } from '@neutrium/quantity/parsers/nearley';
// Also exported from '@neutrium/quantity/parsers.js'.

const result = new NearleyQtyParser().tryParse('kg/(m*s');

if (result.success)
{
    const quantity = new Quantity(result.value);
}
else
{
    console.log(result.error.code); // UNEXPECTED_END
    console.log(result.error.message); // Expected closing parenthesis, with location
}
```

`tryParse()` performs the same validation as `parse()` and returns a discriminated success/error result. Physical restrictions such as absolute zero are still validated by the Quantity constructor rather than the parser.

The existing `@neutrium/quantity/parsers.js` barrel remains available. Individual parser imports are also exposed as `@neutrium/quantity/parsers/nearley` and `@neutrium/quantity/parsers/regex`. A third constructor argument still overrides the parser, but importing the root entry keeps Nearley in the dependency graph.

## Adapt input with a custom parser

Use the parser-independent core to configure your own Quantity class. The factory creates a parser for each independently constructed instance; derived quantities share the originating parser. Parsers must support repeated synchronous calls.

```ts
import { createQuantityClass, type Parser, type QuantityDefinition } from '@neutrium/quantity/core';
import { RegexQtyParser } from '@neutrium/quantity/parsers/regex';

const Quantity = createQuantityClass((config): Parser<QuantityDefinition> => {
    const parser = new RegexQtyParser(config);

    return {
        config: parser.config,
        parse: (input, Numeric) => parser.parse(input.replaceAll('metres', 'm'), Numeric)
    };
});

const length = new Quantity('3 metres');
length.clone().add('2 metres').to('cm').scalar.toString(); // "500"
```

Cloning, arithmetic, conversion, comparisons, and temperature operations preserve parser selection. Results retain the configured class. Operations accept operands from other entry points; result construction follows the receiving instance.

The core also exports `QuantityCore`, `QuantityInitParam`, `QuantityDefinition`, `UnitStructure`, `UnitPower`, `Parser`, and `QuantityConstructor`. The core constructor requires a parser even for definitions: `new QuantityCore(definition, undefined, parser)`. The configured entry points still supply their default parser automatically. Core imports do not load either built-in parser.

Subclasses with additional constructor arguments must implement the protected `constructQuantity(input, units, parser)` hook. It supplies subclass state while preserving the instance's parser and configured class for operands and results. See [subclasses with constructor state](usage.md#subclasses-with-constructor-state).

## Use parsed definitions

Direct parsing produces a definition, not a fully checked physical quantity. The Quantity constructor applies restrictions such as absolute zero and invalid compound temperature units.

```ts
import { NearleyQtyParser } from '@neutrium/quantity/parsers/nearley';

const definition = new NearleyQtyParser().parse('2 m/s');

const speed = new Quantity(definition);
speed.units(); // "m/s"
```

Both parsers throw on incomplete input, unknown units, or invalid syntax. Handle these errors when parsing user input directly.

Definitions use counted unit records such as `{ unit: '<meter>', exponent: 2 }`, with an optional `prefix` token. Empty arrays represent unity. The constructor copies external records and freezes its unit arrays; immutable internal arrays may be shared. See [Migrating to version 5](./migrating-v5.md) for examples and exponent limits.

`UnitStructure` is the shared type for unit metadata alone: `numerator` and `denominator`, with no scalar. `QuantityDefinition` extends it by adding a Decimal `scalar`; quantities and parser results are structurally compatible with it. Use it in helpers that only inspect units:

```ts
import type { UnitStructure, QuantityDefinition } from '@neutrium/quantity/core';
import { Decimal } from '@neutrium/decimal';

const units: UnitStructure = {
    numerator: [{ unit: '<meter>', exponent: 1 }],
    denominator: [{ unit: '<second>', exponent: 1 }],
};
const definition: QuantityDefinition = { ...units, scalar: new Decimal(2) };
```

The type keeps arrays and records read-only while allowing external definitions to replace a whole side. Declaring this type does not validate or freeze an object at runtime; Quantity construction performs that validation and freezing.

## Understand the guards

{@link guards.isQuantity | isQuantity} checks the shared core class across all configured entry points and safely accepts nullish values. It does not recognize plain definitions or instances from a different installed copy of the library.

{@link guards.isQuantityDefinition | isQuantityDefinition} accepts an unknown value and checks for a Decimal scalar and valid counted unit arrays. It validates unit and prefix tokens, positive safe-integer exponents, and duplicate-count overflow. Null, undefined, malformed definitions, and unreadable properties return false. Validation does not mutate or freeze the supplied arrays.

Convert serialized numeric or string scalars into Decimal before validation. NaN and Infinity are valid Decimal values. The guard checks a definition's data, not physical temperature restrictions; construction still rejects invalid temperature combinations and values below absolute zero.

Existing Quantity operands and conversion targets are processed from their tokens, without passing formatted unit strings to the parser. Custom parsers only need to understand the strings supplied by their callers.

## Decimal configuration in custom parsers

The optional second argument to `parse(input, Numeric)` is the Decimal constructor selected by the quantity's configuration. Use `new Numeric(text)` and operations on those instances to preserve isolation, or forward `Numeric` to a bundled parser. Existing one-argument parsers remain supported, but a parser that evaluates scalars with the global Decimal can lose digits or range before Quantity receives its result; adopting the result cannot recover that information.

```ts
import { Decimal } from '@neutrium/decimal';
import { createQuantityClass } from '@neutrium/quantity/core';

const NumericQuantity = createQuantityClass(() => ({
    parse: (input, Numeric = Decimal) => ({
        scalar: new Numeric(input), numerator: [], denominator: [],
    }),
})).withConfig({ precision: 30 });
```

Direct bundled parser calls also accept this optional constructor. Nearley's `tryParse(input, Numeric)` uses the same context as `parse(input, Numeric)`.
