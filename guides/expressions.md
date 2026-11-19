# Evaluating expressions with units

Import `createQuantityEvaluator` from `@neutrium/quantity/expressions` and supply the Quantity class that should own the results. The evaluator supports full mathematical expressions; the constructor's unit parser retains its existing grammar.

```ts
import { Quantity } from '@neutrium/quantity';
import { createQuantityEvaluator } from '@neutrium/quantity/expressions';

const evaluator = createQuantityEvaluator({ Quantity });
const momentum = evaluator.evaluate('2 m/s * 1 kg + 4 kg.m/s');
momentum.to('kg*m/s').scalar.toString(); // "6"

evaluator.evaluate('2 m + 30 cm').to('m').scalar.toString(); // "2.3"
evaluator.evaluate('(2 m + 30 cm) / 2 s').to('m/s').scalar.toString(); // "1.15"
evaluator.evaluate('sqrt(4 m^2)').to('m').scalar.toString(); // "2"
```

Results, numeric literals, constants and bindings all use the supplied class and its numeric context. Plain numbers are dimensionless quantities. You can supply `Quantity` from `/number`, `/regex`, `createQuantityClass()`, or `Quantity.withConfig()`. The evaluator uses Pratt for its unit literals even if the supplied class uses Regex. Importing the evaluator with the Number preset does not retain Decimal or Nearley in a tree-shaken bundle.

## Language and precedence

Supported arithmetic is `+`, `-`, `*`, `/`, `%`, `^` and `**`, with parentheses, unary signs and implicit multiplication. `×`, `÷` and `−` are operator aliases. Unit aliases and prefixes use the existing Quantity catalogue, including `ton(l)`. Use a decimal point, not a locale-specific decimal separator.

Precedence, highest first:

1. Scalar/unit attachment: `2 m^2` is two square metres, while `(2 m)^2` is four.
2. General powers, associated right to left: `2^3^2` is `512`.
3. Unary signs and dot multiplication (`.`, `·`, `⋅`).
4. `*`, `/`, `%` and implicit multiplication, evaluated left to right.
5. Addition and subtraction.

Dots bind more tightly than division, preserving the catalogue's compound-unit notation: `kg/m.s` means `kg/(m*s)`. Prefer explicit parentheses in complex calculations.

A number or scalar fraction followed by a unit is one quantity literal. With whitespace before the unit, `1/2 m` means `0.5 m`, consistently with the constructor's quantity parser. `(1/2) m` and `0.5 m` also mean half a metre. Use `1/(2 m)` for `0.5/m`. The constructor's compact-spacing convention is preserved: `1/2m` also means `1/(2 m)`. Fractions work within larger expressions, such as `1/2 m + 25 cm` (`0.75 m`) and `1/2 m/s` (`0.5 m/s`).

Compact positive powers (`m2`), superscripts (`m²`) and explicit negative powers (`m^-2`) work. Write the caret for negative powers: `m-2` is subtraction. Unit powers support exact decimals and rational fractions: `2 cm^(1/2)`. Literal integer ratios in general powers and `pow` retain their exact fraction, so `(8 m3)^(1/3)` and `pow(8 m3, 1/3)` both produce two metres. Exponents computed through variables or arithmetic use the configured numeric precision. General exponents must be dimensionless.

## Compile once, evaluate with bindings

```ts
const expression = evaluator.compile('mass * velocity + offset');
expression.variables; // ['mass', 'velocity', 'offset']

const result = expression.evaluate({
    mass: new Quantity('1 kg'),
    velocity: new Quantity('2 m/s'),
    offset: new Quantity('4 kg*m/s'),
});
```

Compilation parses the source and converts literals once. Bindings may contain Quantity instances, backend scalars, numbers, bigints or numeric strings. Quantities from another backend are adopted by the configured class. Construct a Quantity for unit-bearing strings; a binding such as `{ mass: '2 kg' }` is rejected. Only own data properties are read; getters and inherited properties cannot supply variables.

Identifiers use letters, digits and underscores and cannot begin with a digit. Unit aliases are reserved in expression text; use names such as `mass`, `distance` and `duration` rather than `m`, `s` or `kg`. A name followed by parentheses is a function call, so `min(...)` calls a function while `2 min` means two minutes. Catalogue aliases containing parentheses, such as `ton(l)`, remain unit literals.

## Functions and constants

Built-in functions are:

| Function | Meaning |
| --- | --- |
| `sqrt(value)`, `cbrt(value)` | Roots of the scalar and unit powers. |
| `pow(base, exponent)` | General power; exponent must be dimensionless. |
| `abs(value)` | Absolute value of an ordinary quantity or temperature interval. |
| `min(values...)`, `max(values...)` | Select among compatible quantities. At least one argument is required. |

Scientific functions such as trigonometry and logarithms are not registered by default. Applications can add functions with explicit dimension requirements. Named constants and functions cannot replace built-in registrations.

```ts
const calculator = createQuantityEvaluator({
    Quantity,
    constants: {
        gravity: new Quantity('9.81 m/s2')
    },
    functions: {
        double: { minArgs: 1, evaluate: ([value]) => value.mul(2) },
    },
});

calculator.evaluate('double(2 kg) * gravity').to('N').scalar.toString(); // "39.24"
```

Custom functions receive a frozen array of quantities and must return a Quantity in the evaluator's numeric context. `maxArgs` defaults to `minArgs`; variadic functions must specify a finite maximum within the evaluator's `maxArguments`. The evaluator's `functions` and `constants` properties expose registration metadata.

## Dimensions, temperatures and errors

Addition, subtraction and remainder require compatible dimensions. Remainder first converts the right operand to the left operand's units. Division by a zero-valued quantity is rejected. Quantity's existing conversion and absolute-temperature rules apply to each operation:

```ts
evaluator.evaluate('20 tempC - 10 tempC'); // 10 degC
evaluator.evaluate('-20 tempC + 10 degC'); // -10 tempC
evaluator.evaluate('20 tempC + 10 tempC'); // throws: cannot add absolute temperatures
evaluator.evaluate('2 m + 3 s');          // throws: incompatible dimensions
```

Signed absolute-temperature readings are literals. Negating a grouped absolute temperature (`-(20 tempC)`) is rejected; `abs` and `%` also reject absolute temperatures.

`evaluate` and `compile` throw `ExpressionError`, exported from `/expressions`, with `code`, `start`, `end` and an optional `cause`. Locations are half-open UTF-16 offsets in the original source. Operation errors point to the operator or function name. `tryEvaluate` returns a discriminated result suitable for an editing UI:

```ts
const result = evaluator.tryEvaluate('2 m +');

if (result.status === 'complete')
{
    console.log(result.value);
}
else
{
    // 'incomplete' needs more source text; 'error' needs a correction or a binding.
    console.log(result.status, result.error.code, result.error.start, result.error.end);
}
```

Compiled expressions also expose `tryEvaluate(bindings)`. Use `parse(source)` to inspect the immutable syntax tree without resolving names or evaluating literals.

Configure `limits` (`maxLength`, `maxTokens`, `maxDepth`, `maxArguments`) to bound syntax processing. These do not limit work inside a numeric backend or application callback. Registered callbacks are trusted application code and should preserve immutable values and a stable numeric context. Expression text cannot access object members, assign variables, import modules or execute JavaScript.
