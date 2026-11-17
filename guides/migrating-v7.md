# Migrating to version 7

## Pratt is the default expression parser

Both `@neutrium/quantity` (Decimal) and `@neutrium/quantity/number` (JavaScript doubles) now use Pratt. Pratt and Nearley share the unit syntax and evaluate scalars through the selected numeric adapter.

Pratt allows **256 active expression levels**, including the outer expression. Each nested group and the right operand currently being parsed use another level. For example, a single unit can be enclosed in 255 pairs of parentheses. Flat products such as `kg*m/s` reuse those levels as they proceed. Exceeding the limit raises `QuantityParseError` with code `LIMIT_EXCEEDED`.

For malformed inputs, expected tokens and the first error reported can differ between the two parsers. If you generate deeply nested expressions or rely on Nearley's diagnostics, select Nearley explicitly. Either preset accepts a parser as the third constructor argument.

```ts
import { Quantity } from '@neutrium/quantity';
import { NearleyParser } from '@neutrium/quantity/parsers/nearley';

const expression = '('.repeat(300) + '2 m' + ')'.repeat(300);
new Quantity(expression, undefined, new NearleyParser()).units(); // "m"
```

For a class that always uses Nearley, supply it to `createQuantityClass()`. [Parser selection](parsers.md#use-nearley-explicitly)

## Decibels and decibytes

Version 7 reserves `dB` for decibels. If older expressions use `dB` for a tenth of a byte, change them to `decibyte` before parsing them with version 7. The symbol `B` still means byte.

```ts
new Quantity('10 dB').to('bel').scalar.toString(); // "1"
new Quantity('10 decibyte').to('byte').scalar.toString(); // "1"
```

Bels, decibels, and nepers have a dedicated logarithmic-level dimension. A conversion from `dB` to a unitless quantity now raises an incompatible-units error. Converting `20 dB` to `1/dB` gives the reciprocal, `0.05 1/dB`.

## Catalog conversions

The pressure-head symbols `mmH2O`, `cmH2O`, `inH2O`, `mmHg`, `cmHg`, and `inHg` use conventional densities and standard gravity. For example, `1 cmH2O` converts to exactly `98.0665 Pa`. The U.S. liquid barrel `bl(usl)` uses 31.5 U.S. gallons, and the U.S. petroleum drum `drum(usp)` uses 55. Both `u` and `Da` use the CODATA 2022 central value of `1.66053906892e-27 kg`. [NIST conversion tables](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9) · [CODATA atomic mass constant](https://physics.nist.gov/cgi-bin/cuu/Value?ukg)

The International Table `BTU` converts to exactly `1055.05585262 J`. The thermochemical `BTU(th)` uses an exact ratio, so `9 BTU(th)` converts to exactly `9489.1523804 J`. The EC `therm` converts to `105506000 J`. Use `therm(us)` for `105480400 J`. [NIST energy conversion factors](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8) · [NIST definition of the International Table BTU](https://www.nist.gov/pml/special-publication-811/nist-guide-si-footnotes)

The Planck length (`Planck`) uses the CODATA 2022 central value of `1.616255e-35 m`. [CODATA recommended values](https://physics.nist.gov/cuu/pdf/all.pdf)

One `Neper` converts to approximately `8.68588963806504 dB`. The catalog stores the conversion factor to 51 significant digits.

## Reading unit exponents

In version 6, `UnitPower.exponent` was always a number. In version 7, whole powers still use safe integers, and fractional powers use a reduced fraction with `bigint` components. Code that reads `numerator` or `denominator` records must handle both shapes. For example, taking the square root of `m` produces a numerator record with exponent `{ numerator: 1n, denominator: 2n }`.

```ts
import type { UnitPower } from '@neutrium/quantity/factory';

function exponentText({ exponent }: UnitPower): string
{
    if (typeof exponent === 'number')
    {
        return String(exponent);
	}

    return `${exponent.numerator}/${exponent.denominator}`;
}
```

When constructing a definition or returning one from a custom parser, supply a positive integer or a fraction record for each exponent. Put negative powers on the denominator side. When storing a unit expression as JSON, `quantity.units()` gives a parseable string such as `m^(1/2)`. Serializing raw fractional records requires explicit handling of `bigint`.

## Selecting a numeric adapter

Quantity 7 uses Math 2.1.0 and Utilities 5.0.0. If you import adapters to configure the factory or call a parser directly, declare `@neutrium/math` as a dependency and update the imports. The default Quantity import uses the scientific Decimal adapter.

| Previous utilities suffix | New math suffix |
| --- | --- |
| `/numeric` and `/numeric/*` | `/numeric` and `/numeric/*` |
| `/number` | `/adapters/number` |
| `/bigint` | `/adapters/bigint` |
| `/decimal` and `/decimal/*` | `/adapters/decimal` and `/adapters/decimal/*` |

For example, import `DecimalArithmeticAdapter` from `@neutrium/math/adapters/decimal/arithmetic`. Both Decimal tiers support fractional quantity powers, including `sqrt()` and `cbrt()`. See [numeric backends](numeric-backends.md) for factory examples.

## Arithmetic in parsed expressions

Nearley and Pratt use the selected adapter for explicit arithmetic. At three significant digits, `1.23456 m` preserves the reading and `1.23456 m * 1` rounds to `1.23 m`, just like calling `.mul(1)`. Division by zero also follows the adapter. With the Decimal and JavaScript number presets, `1/0 m` yields `Infinity m`. If your application requires finite values, check `quantity.numeric.isFinite(quantity.scalar)` after parsing.
