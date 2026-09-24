# Working with quantities

## Construct and read a quantity

Use `new Quantity(...)`, then read its {@link Quantity.Quantity.scalar | scalar} and {@link Quantity.Quantity.units | units}. There is no combined value-formatting method.

```ts
import { Quantity } from '@neutrium/quantity';

const length = new Quantity('1.25', 'm');
const display = `${length.scalar.toString()} ${length.units()}`; // "1.25 m"
new Quantity('m').scalar.toString(); // "1"
new Quantity('2').units(); // ""
```

The scalar is an `@neutrium/decimal` Decimal. Supply decimal strings when every input digit matters: a JavaScript number may already have been rounded before it reaches the constructor. `scalar.toNumber()` converts back to a JavaScript number
and may lose precision.

| Input                           | Example                  | Behavior                               |
| ------------------------------- | ------------------------ | -------------------------------------- |
| Scalar and units in one string  | `new Quantity('2.5 m')`  | Parses both parts.                     |
| Separate scalar and units       | `new Quantity(2.5, 'm')` | Uses the first argument as the scalar. |
| Unit expression only            | `new Quantity('m/s')`    | Defaults to a scalar of 1.             |
| Scalar string only              | `new Quantity('2.5')`    | Creates a unitless quantity.           |
| Existing quantity or definition | `new Quantity(length)`   | Reuses its scalar and unit arrays.     |

Bare numbers and Decimal objects require a nonempty units argument. `new Quantity(2)` and `new Quantity(2, '')` are unsupported; use `new Quantity('2')`.

Quantity methods are shared on the prototype and require their instance as `this`. Arithmetic, comparison, and temperature methods are no longer automatically bound. When passing a method as a callback, wrap it or explicitly bind it:

```ts
const length = new Quantity('2 m');
const matches = ['200 cm', '3 m'].map(value => length.eq(value)); // [true, false]
const equalsLength = length.eq.bind(length);

equalsLength('200 cm'); // true
```

## Write unit expressions

The default parser accepts multiplication (`*`, `.`, or spaces), division (`/`), integer powers (`^`), and parenthesized groups:

```ts
new Quantity('2 (kg*m/s^2)^1').to('N').scalar.toString(); // "2"
new Quantity('3 m^2').units(); // "m2"
```

In the current grammar, a parenthesized group must be followed by an integer exponent. Use `(m/s)^1` when grouping without changing the power.

The normalized output is not a copy of the input spelling. Aliases collapse to standard names, multiplication uses `*`, and powers use compact notation. For reciprocal input, use `m^-1`; the formatted output `1/m` is not accepted by
the default parser, so do not assume every formatted string can be parsed back.

## Convert units

{@link Quantity.Quantity.to | Quantity.to} accepts a target unit string or another Quantity. Prefer a units-only string: a scalar embedded in that string affects conversion. When a Quantity is supplied, only its units are used.

```ts
const length = new Quantity('2 m');
length.to('cm').scalar.toString(); // "200"
length.to(new Quantity('7 cm')).scalar.toString(); // "200"
new Quantity('250 cm').toBase().scalar.toString(); // "2.5"
```

Compatible dimensions convert directly. Reciprocal dimensions also work: `new Quantity('2 m').to('m^-1')` has scalar `0.5`. Unrelated dimensions such as length and time throw. Reciprocal conversion of zero also throws.

Conversions can return the original instance or a cached result. Do not rely on object identity to detect whether a conversion happened.

## Calculate and compare

Addition and subtraction accept quantity expressions, definitions, and quantities. Multiplication and division also accept bare numbers and Decimal scalars.

```ts
const length = new Quantity('1 m');
length.add('25 cm').scalar.toString(); // "1.25"
length.mul(3).scalar.toString(); // "3"
length.div('25 cm').scalar.toString(); // "4"
length.div('25 cm').isUnitless(); // true
length.scalar.toString(); // "1" — operations leave the operand unchanged
```

{@link Quantity.Quantity.eq | Quantity.eq} compares physical values after conversion. {@link Quantity.Quantity.same | Quantity.same} requires identical scalar values and normalized units. Ordering methods throw for incompatible dimensions; {@link Quantity.Quantity.isCompatible | Quantity.isCompatible} checks dimensions without comparing values.

```ts
const length = new Quantity('1 m');
length.eq('100 cm'); // true
length.same(new Quantity('100 cm')); // false
length.compareTo('50 cm'); // 1
length.isCompatible('s'); // false
```

Use strings for unitless addition and comparisons, for example `new Quantity('2').add('3')`. Numeric arguments in the shared input types do not mean every method accepts a bare number.

## Errors and current edge cases

Parsing, incompatible arithmetic, and invalid absolute-temperature operations can throw. Catch errors at the boundary where users supply expressions:

```ts
function convert(input: string, targetUnits: string): string
{
    try
    {
        return new Quantity(input).to(targetUnits).scalar.toString();
    }
    catch (error)
    {
        return error instanceof Error ? error.message : 'Unable to convert quantity';
    }
}
```

- {@link Quantity.Quantity.inverse | Quantity.inverse} rejects zero explicitly. {@link Quantity.Quantity.div | Quantity.div} delegates
  scalar division to Decimal; check zero divisors if your application must reject them.
- {@link Quantity.Quantity.pow | Quantity.pow} supports integer exponents. Exponent zero returns
  the dimensionless identity (`1` with no units).
- {@link Quantity.Quantity.clone | Quantity.clone} creates a new instance but shares scalar and unit arrays;
  it is not a deep copy and does not preserve a custom parser.
- Assigning to public fields does not invalidate caches. Treat quantities as immutable.
