# Parsers and definitions

A parser turns an expression such as `2 kg*m/s^2` into a scalar and units. Most applications can use Quantity's default parser without configuring it.

## Choose a parser

| Parser | Choose it for | Quantity import |
| --- | --- | --- |
| {@link parsers.PrattParser | PrattParser} | The default for grouped expressions, scalar calculations, Unicode notation, and structured errors. | `@neutrium/quantity` or `@neutrium/quantity/number` |
| {@link parsers.NearleyParser | NearleyParser} | Nearley diagnostics or generated expressions deeper than Pratt's nesting limit. | Pass `new NearleyParser()` to the constructor or configure a class with the factory. |
| {@link parsers.RegexParser | RegexParser} | Simpler unit expressions and a smaller parser bundle. | `@neutrium/quantity/regex` |

The default parser configurations use Decimal scalars. The number preset uses JavaScript doubles. The numeric adapter determines precision for each preset. [Numeric backends](numeric-backends.md)

```ts
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';

new Quantity('2 (kg*m/s^2)').to('N').scalar.toString(); // "2"
new RegexQuantity('2 kg*m/s^2').to('N').scalar.toString(); // "2"
```

Pratt limits recursive expression depth to 256 levels, including the outer expression. Nested groups and active right operands each consume a level. Flat products and quotients are parsed iteratively. Exceeding the limit produces `QuantityParseError` with code `LIMIT_EXCEEDED`.

### Use Nearley explicitly

Pass `new NearleyParser()` as the third constructor argument for an individual quantity. To use Nearley throughout an application, select it through the factory.

```ts
import { createQuantityClass } from '@neutrium/quantity/factory';
import { NearleyParser } from '@neutrium/quantity/parsers/nearley';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';

const NearleyQuantity = createQuantityClass({
    numeric: new DecimalScientificAdapter(),
    parser: config => new NearleyParser(config),
});
new NearleyQuantity('1/2 (kg·m/s)²').scalar.toString(); // "0.5"
```

Pratt and Nearley share the Moo lexer, scalar evaluator, unit resolution and cache settings. Both expose `parse()`, `tryParse()`, `config`, `cacheStats`, and `clearCache()`. They can report different first errors or expected tokens for malformed input. [Parser benchmarks](benchmarks.md#regex-nearley-and-pratt-parsers)

## Write unit expressions

All three parsers support these forms:

| Form | Examples |
| --- | --- |
| Scalar and units | `2 m`, `1e3 m`, `-2.5 m` |
| Units only, with scalar 1 | `m`, `kg*m/s^2` |
| Scalar only, without units | `2`, `0.5` |
| Multiplication | `kg*m`, `kg.m`, `kg m` |
| Division and reciprocals | `m/s`, `2/s`, `1/m`, `/s` |
| Unit powers | `m^2`, `m**2`, `m2`, `s^-2`, `m^0.5`, `m^(1/3)` |
| Prefixes attached to units | `km`, `mm`, `mdegC` |

Unit exponents are exact rationals. Decimal and scientific notation require `^` or `**`; use `m^0.5` or `m^5e-1`. Rational fractions require parentheses, such as `m^(1/3)`; `m^1/3` means `(m^1)/3`. Compact notation such as `m2` remains integer-only. Formatted fractions use reduced rational notation (`m^(1/2)`). Use `km`, not `k m`, for kilometres. Exact unit aliases take priority: `min` means minute, while `minch` means milli-inch.

Nearley and Pratt additionally support nested groups, such as `kg/(m*s)` and `(m/s)^2`. Groups do not need a following exponent. Regex accepts parentheses in registered unit names such as `ton(l)` and in fractional unit exponents. It reads a single leading scalar and interprets the rest as a unit label, including the unity unit in `m/1`. Choose Nearley or Pratt for scalar arithmetic and grouped expressions.

### Multiplication and division order

All three parsers apply powers first, then dot multiplication (`.`), then ordinary multiplication (`*` or whitespace) and division from left to right:

| Input | Meaning | Formatted units |
| --- | --- | --- |
| `kg/m.s` | `kg/(m*s)` | `kg/m.s` |
| `kg/m/s` | `kg/(m*s)` | `kg/m.s` |
| `kg/m*s` | `(kg/m)*s` | `kg*s/m` |
| `kg/m s` | `(kg/m)*s` | `kg*s/m` |

Spaces around a dot do not change its precedence. Use repeated division with any parser, or parentheses with Nearley or Pratt, to make compound denominators clear. `units()` produces normalized expressions, so its spelling can differ from the input.

## Calculate within an expression

Nearley and Pratt can multiply, divide, and raise scalars or groups to powers. They do not support addition or subtraction operators; use Quantity's `add()` and `sub()` methods instead.

```ts
import { Quantity } from '@neutrium/quantity';

new Quantity('1/2 m').scalar.toString(); // "0.5"
new Quantity('(2 m/s)**2').scalar.toString(); // "4"
new Quantity('(2 m/s)**2').units(); // "m2/s2"
new Quantity('1 m').add('25 cm').scalar.toString(); // "1.25"
```

Attaching units preserves the input scalar. Explicit multiplication and division use the selected adapter, including operations with one. Scalar division by zero follows the same rules as `quantity.div(0)`. With the default Decimal or JavaScript number backend, `1/0 m` yields `Infinity m` and `0/0` yields `NaN`. If the adapter rejects division by zero, the parser reports `DIVISION_BY_ZERO` at the slash.

```ts
const Q = Quantity.withConfig({ numeric: { precision: 3 } });
new Q('1.23456 m').scalar.toString();     // "1.23456"
new Q('1.23456 1/s').scalar.toString();   // "1.23456"
new Q('1.23456 m * 1').scalar.toString(); // "1.23"
new Q('1.23456 m / 1').scalar.toString(); // "1.23"
```

Spacing matters when a scalar touches a unit: `1/2 m` means `(1/2)*m`, whereas `1/2m` means `1/(2*m)`. Write `m/(2 s)` when both `2` and `s` belong in the denominator. Use explicit operators or groups when the intended calculation could be unclear.

Signs on numbers are supported, but `2 -3 m` is not subtraction. Write `2 * -3 m` to multiply by a negative value. To avoid ambiguity in signed powers, use `(-2)^2` for `4` or `-(2)^2` for `-4`; `-2^2` also evaluates to `4`.

Nearley and Pratt evaluate grouped quantity powers such as `(4 m^2)^0.5` and `(-8 m^3)^(1/3)` with either Decimal tier, JavaScript doubles, or a custom adapter with rational extraction and construction or scientific operations. The same rule applies to standalone scalars. For example, `(-32)^0.2`, `(-32)^2e-1`, and `(-32)^(1/5)` each produce `-2`. Scientific adapters also accept scalar-only decimal or scientific exponent literals beyond the supported unit-exponent range. A unit-only expression such as `m^(1/2)` needs no scalar exponentiation. Calculations follow the written order and the selected backend's precision.

Pass calculations as a single expression. A separate scalar argument replaces the expression's scalar: `new Quantity(2, 'm/2')` has value `2 m`, while `new Quantity('2 m/2')` has value `1 m`.

### Unicode notation

All three parsers accept Unicode unit and prefix aliases such as `Å`, `Ω`, and `µm`. Formatted unit names can also contain Unicode. For example, `new Quantity('angstrom').units()` returns `"Å"`.

Nearley and Pratt also accept superscript integer powers (`m²`, `m⁻²`, `(m/s)²`), middle dots (`·` or `⋅`), and the multiplication sign `×`. Superscripts attach directly to their base. With Regex, write `m^2` for a power and use `.` or `*` for multiplication.

## Handle input errors

Quantity construction throws when input is invalid or incomplete. Nearley and Pratt report parsing failures as `QuantityParseError`; Regex throws ordinary errors. Catch errors around construction when validating a complete physical quantity.

For interactive input validation, `tryParse()` on Nearley and Pratt returns a success/error result instead of throwing a parsing error. Direct parser calls require a numeric adapter; Quantity normally supplies this for you:

```ts
import { Quantity } from '@neutrium/quantity';
import { PrattParser } from '@neutrium/quantity/parsers/pratt';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';

const parser = new PrattParser();
const numeric = new DecimalScientificAdapter();
const result = parser.tryParse('kg/(m*s', numeric);

if (result.success) {
    const quantity = new Quantity(result.value);
} else {
    console.log(result.error.code); // "UNEXPECTED_END"
    console.log(result.error.expected); // [")"]
    console.log(result.error.message); // Explanation with a source line and caret
}
```

Errors expose `code`, `input`, `offset`, `line`, `column`, and `expected` for form feedback. Lines and columns start at 1. Offsets start at 0 and use JavaScript UTF-16 indices. For `m/`, Pratt reports `UNEXPECTED_END` at offset 2 with the legal next token types `integer`, `lParen`, `sign`, `signedFloat`, and `unit`. Common codes also include `UNKNOWN_UNIT`, `UNEXPECTED_TOKEN`, `INVALID_EXPONENT`, and `DIVISION_BY_ZERO`. See {@link parsers.QuantityParseError | QuantityParseError} for the API.

`parse()` and `tryParse()` validate expressions, not physical temperature rules. Construct a Quantity from a successful result to check constraints such as absolute zero. Construction also checks intermediate readings, products, quotients, and powers. For example, `1/(1/tempC)` fails at construction because its inner quotient divides by an absolute temperature. Regex does not provide `tryParse()`.

## Configure caching

The default parser cache limits are suitable for most applications. To limit retained parsing work, configure the Quantity class:

```ts
import { Quantity } from '@neutrium/quantity';

const ConfiguredQuantity = Quantity.withConfig({
    cache: { parser: { maxEntries: 256, maxBytes: 1024 * 1024 } },
});
ConfiguredQuantity.config.cache.parser.maxEntries; // 256
```

Use `cache: { parser: false }` to disable parser caching, or `cache: false` to disable all optional Quantity caching. These settings control retention, not the maximum expression length or total memory used during parsing. Standalone parser constructors accept `{ cache: { maxEntries, maxBytes } }` instead. See [configuration](usage.md#configuration) for defaults and budgets.

## Adapt input with a custom parser

Use `createQuantityClass()` to handle application-specific input. Wrapping a bundled parser lets you adapt spelling without implementing unit parsing yourself:

```ts
import { createQuantityClass, type Parser } from '@neutrium/quantity/factory';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { RegexParser } from '@neutrium/quantity/parsers/regex';

const CustomQuantity = createQuantityClass({
    numeric: new NumberAdapter(),
    parser: config => {
        const delegate = new RegexParser(config);
        return {
            config: delegate.config,
            parse: (text, numeric, scope, scalar) =>
                delegate.parse(text.replaceAll('metres', 'm'), numeric, scope, scalar),
        } satisfies Parser<number>;
    },
});

new CustomQuantity('2 metres').to('cm').scalar; // 200
```

A custom `Parser<T>` returns a `QuantityDefinition<T>` with a scalar and counted unit arrays. Use the numeric adapter supplied to `parse()` for scalar creation and arithmetic so the selected backend and settings are respected. Forward the cache scope and optional replacement scalar when wrapping a bundled parser. Quantity supplies the replacement for string conversion targets, dimensional predicates, and the units argument of a constructor. This lets the parser validate the units without evaluating an ignored scalar expression. Clones, arithmetic, and conversions retain the originating parser.

## Work with parsed definitions

Most callers can use Quantity directly. If you need a parsed definition first, import `NearleyParser`, `RegexParser`, or `PrattParser` from `/parsers/nearley`, `/parsers/regex`, or `/parsers/pratt`. All three are also available from `/parsers.js`.

```ts
import { Quantity } from '@neutrium/quantity/number';
import { PrattParser } from '@neutrium/quantity/parsers/pratt';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { isQuantityDefinition } from '@neutrium/quantity/guards.js';

const numeric = new NumberAdapter();
const definition = new PrattParser().parse('2 m/s', numeric);
isQuantityDefinition(definition, numeric); // true
new Quantity(definition).scalar; // 2
```

`QuantityDefinition<T>` contains a scalar of type `T`, plus `numerator` and `denominator` arrays of counted unit records. Fractions use a reduced `{ numerator: bigint, denominator: bigint }` exponent; integers retain a numeric exponent. For example, square metres use `{ unit: '<meter>', exponent: 2 }`; an empty array represents unity. These types are exported from `/factory`.

`isQuantityDefinition(value, numeric)` checks the scalar representation and unit records, returning false for malformed inputs. It does not check physical temperature restrictions. `isQuantity(value)` recognizes quantities from any backend in this installed package. See [numeric backends](numeric-backends.md) for converting between scalar representations.

Explicit decimal exponent expansion is limited to 4096 places. Exponent magnitudes and intermediate dimensional sums must remain within ±`Number.MAX_SAFE_INTEGER`; overflow throws before precision can be lost.
