# Parsers and definitions

A parser turns an expression such as `2 kg*m/s^2` into a scalar and units. Most applications can use Quantity's default parser without configuring it.

## Choose a parser

| Parser | Choose it for | Quantity import |
| --- | --- | --- |
| {@link parsers.NearleyParser | NearleyParser} | Grouped expressions, scalar calculations, Unicode notation, and detailed input errors. | `@neutrium/quantity` |
| {@link parsers.RegexParser | RegexParser} | Simpler unit expressions and a smaller parser bundle. | `@neutrium/quantity/regex` |

Both presets use Decimal scalars. Choosing Regex changes the accepted syntax, not numeric precision. For JavaScript numbers or another numeric representation, see [numeric backends](numeric-backends.md).

```ts
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';

new Quantity('2 (kg*m/s^2)').to('N').scalar.toString(); // "2"
new RegexQuantity('2 kg*m/s^2').to('N').scalar.toString(); // "2"
```

The Regex preset excludes Nearley and Moo from runtime bundles. Passing a Regex parser to the default Quantity constructor also works, but keeps the default parser in the import graph. npm still installs the package's declared dependencies.

## Write unit expressions

Both parsers support these forms:

| Form | Examples |
| --- | --- |
| Scalar and units | `2 m`, `1e3 m`, `-2.5 m` |
| Units only, with scalar 1 | `m`, `kg*m/s^2` |
| Scalar only, without units | `2`, `0.5` |
| Multiplication | `kg*m`, `kg.m`, `kg m` |
| Division and reciprocals | `m/s`, `2/s`, `1/m`, `/s` |
| Integer unit powers | `m^2`, `m**2`, `m2`, `s^-2` |
| Prefixes attached to units | `km`, `mm`, `mdegC` |

Unit exponents must be safe integers; fractional forms such as `m^0.5` and `m^2.1` are rejected. Use `km`, not `k m`, for kilometres. Exact unit aliases take priority: `min` means minute, while `minch` means milli-inch.

Nearley additionally supports nested groups, such as `kg/(m*s)` and `(m/s)^2`. Groups do not need a following exponent. Regex accepts parentheses in registered unit names such as `ton(l)`, but not as expression grouping.

### Multiplication and division order

Both parsers apply powers first, then dot multiplication (`.`), then ordinary multiplication (`*` or whitespace) and division from left to right:

| Input | Meaning | Formatted units |
| --- | --- | --- |
| `kg/m.s` | `kg/(m*s)` | `kg/m.s` |
| `kg/m/s` | `kg/(m*s)` | `kg/m.s` |
| `kg/m*s` | `(kg/m)*s` | `kg*s/m` |
| `kg/m s` | `(kg/m)*s` | `kg*s/m` |

Spaces around a dot do not change its precedence. Use repeated division with either parser, or parentheses with Nearley, to make compound denominators clear. `units()` produces normalized expressions, so its spelling can differ from the input.

## Calculate within an expression

Nearley can multiply, divide, and raise scalars or groups to powers. It does not support addition or subtraction operators; use Quantity's `add()` and `sub()` methods instead.

```ts
import { Quantity } from '@neutrium/quantity';

new Quantity('1/2 m').scalar.toString(); // "0.5"
new Quantity('(2 m/s)**2').scalar.toString(); // "4"
new Quantity('(2 m/s)**2').units(); // "m2/s2"
new Quantity('1 m').add('25 cm').scalar.toString(); // "1.25"
```

Spacing matters when a scalar touches a unit: `1/2 m` means `(1/2)*m`, whereas `1/2m` means `1/(2*m)`. Write `m/(2 s)` when both `2` and `s` belong in the denominator. Use explicit operators or groups when the intended calculation could be unclear.

Signs on numbers are supported, but `2 -3 m` is not subtraction. Write `2 * -3 m` to multiply by a negative value. To avoid ambiguity in signed powers, use `(-2)^2` for `4` or `-(2)^2` for `-4`; `-2^2` also evaluates to `4`.

Pure scalar fractional powers such as `(4)^0.5` require a scientific numeric backend, which the default Decimal preset provides. Expressions involving units require integer powers, even when the units cancel, as in `(m/m)^0.5`. Calculations follow the written order and the selected backend's precision. Division by zero in an expression throws.

Pass calculations as a single expression. A separate scalar argument replaces the expression's scalar: `new Quantity(2, 'm/2')` has value `2 m`, while `new Quantity('2 m/2')` has value `1 m`.

### Unicode notation

Nearley accepts superscript integer powers (`m²`, `m⁻²`, `(m/s)²`), middle dots (`·` or `⋅`, equivalent to `.`), and `×` as an alternative to `*`. Superscripts attach directly to their base. Regex requires ASCII notation; formatted output from either parser uses ASCII.

## Handle input errors

Quantity construction throws when input is invalid or incomplete. Nearley reports parsing failures as `QuantityParseError`; Regex throws ordinary errors. Catch errors around construction when validating a complete physical quantity.

For interactive input validation, Nearley's `tryParse()` returns a success/error result instead of throwing a parsing error. Direct parser calls require a numeric adapter; Quantity normally supplies this for you:

```ts
import { Quantity } from '@neutrium/quantity';
import { NearleyParser } from '@neutrium/quantity/parsers/nearley';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';

const parser = new NearleyParser();
const numeric = new DecimalScientificAdapter();
const result = parser.tryParse('kg/(m*s', numeric);

if (result.success) {
    const quantity = new Quantity(result.value);
} else {
    console.log(result.error.code); // "UNEXPECTED_END"
    console.log(result.error.message); // Explanation with a source line and caret
}
```

Errors expose `code`, `input`, `offset`, `line`, `column`, and `expected` for form feedback. Lines and columns start at 1; offsets start at 0 and use JavaScript UTF-16 indices. Common codes include `UNKNOWN_UNIT`, `UNEXPECTED_TOKEN`, `UNEXPECTED_END`, `INVALID_EXPONENT`, and `DIVISION_BY_ZERO`. See {@link parsers.QuantityParseError | QuantityParseError} for the API.

`parse()` and `tryParse()` validate expressions, not physical temperature rules. Construct a Quantity from a successful result to check constraints such as absolute zero. Regex does not provide `tryParse()`.

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
import { NumberAdapter } from '@neutrium/utilities/number';
import { RegexParser } from '@neutrium/quantity/parsers/regex';

const CustomQuantity = createQuantityClass({
    numeric: new NumberAdapter(),
    parser: config => {
        const delegate = new RegexParser(config);
        return {
            config: delegate.config,
            parse: (text, numeric, scope) =>
                delegate.parse(text.replaceAll('metres', 'm'), numeric, scope),
        } satisfies Parser<number>;
    },
});

new CustomQuantity('2 metres').to('cm').scalar; // 200
```

A custom `Parser<T>` returns a `QuantityDefinition<T>` with a scalar and counted unit arrays. Use the numeric adapter supplied to `parse()` for scalar creation and arithmetic so the selected backend and settings are respected. When wrapping a bundled parser, forward all three arguments so cache settings are respected too. Clones, arithmetic, and conversions retain the originating parser.

## Work with parsed definitions

Most callers can use Quantity directly. If you need a parsed definition first, import `NearleyParser` or `RegexParser` from `/parsers/nearley` or `/parsers/regex`. Both are also available from `/parsers.js`.

```ts
import { Quantity } from '@neutrium/quantity/number';
import { NearleyParser } from '@neutrium/quantity/parsers/nearley';
import { NumberAdapter } from '@neutrium/utilities/number';
import { isQuantityDefinition } from '@neutrium/quantity/guards.js';

const numeric = new NumberAdapter();
const definition = new NearleyParser().parse('2 m/s', numeric);
isQuantityDefinition(definition, numeric); // true
new Quantity(definition).scalar; // 2
```

`QuantityDefinition<T>` contains a scalar of type `T`, plus `numerator` and `denominator` arrays of counted unit records. For example, square metres use `{ unit: '<meter>', exponent: 2 }`; an empty array represents unity. These types are exported from `/factory`.

`isQuantityDefinition(value, numeric)` checks the scalar representation and unit records, returning false for malformed inputs. It does not check physical temperature restrictions. `isQuantity(value)` recognizes quantities from any backend in this installed package. See [numeric backends](numeric-backends.md) for converting between scalar representations.
