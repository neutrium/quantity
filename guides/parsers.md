# Parsers and definitions

## Choose a parser

{@link parsers.NearleyQtyParser | NearleyQtyParser} is the default. It supports compound expressions, integer
powers, and parenthesized groups followed by an exponent, such as `(m/s)^2`. {@link parsers.RegexQtyParser | RegexQtyParser} is the legacy alternative and does not support parenthesized grouping.

Choose the default or regex entry point at import time:

```ts
import { Quantity } from '@neutrium/quantity'; // Nearley
// Or: import { Quantity } from '@neutrium/quantity/regex';

const speed = new Quantity('12 m/s');
speed.scalar.toString(); // "12"
```

The regex entry point imports no Nearley runtime, grammar, or Moo lexer. The root entry imports no regex parser. These boundaries let bundlers exclude the unused parser; npm still installs the package's declared dependencies.

The existing `@neutrium/quantity/parsers.js` barrel remains available. Individual parser imports are also exposed as `@neutrium/quantity/parsers/nearley` and `@neutrium/quantity/parsers/regex`. A third constructor argument still overrides
the parser, but importing the root entry keeps Nearley in the dependency graph.

## Adapt input with a custom parser

Use the parser-independent core to configure your own Quantity class. The factory creates a parser for each independently constructed instance; derived quantities share the originating parser. Parsers must support repeated synchronous calls.

```ts
import { createQuantityClass, type Parser, type QuantityDefinition } from '@neutrium/quantity/core';
import { RegexQtyParser } from '@neutrium/quantity/parsers/regex';

const Quantity = createQuantityClass((): Parser<QuantityDefinition> => {
    const parser = new RegexQtyParser();

    return {
        parse: input => parser.parse(input.replaceAll('metres', 'm'))
    };
});

const length = new Quantity('3 metres');
length.clone().add('2 metres').to('cm').scalar.toString(); // "500"
```

Cloning, arithmetic, conversion, comparisons, and temperature operations preserve parser selection. Results retain the configured class. Operations accept operands from other entry points; result construction follows the receiving instance.

The core also exports `QuantityCore`, `QuantityInitParam`, `QuantityDefinition`, `Parser`, and `QuantityConstructor`. The core constructor requires a parser even for definitions: `new QuantityCore(definition, undefined, parser)`. The configured entry points still supply their default parser automatically. Core imports do not load either built-in parser.

## Use parsed definitions

Direct parsing produces a definition, not a fully checked physical quantity. The Quantity constructor applies restrictions such as absolute zero and invalid compound temperature units.

```ts
import { NearleyQtyParser } from '@neutrium/quantity/parsers/nearley';

const definition = new NearleyQtyParser().parse('2 m/s');

if (!definition)
{
    throw new Error('Incomplete quantity expression');
}

const speed = new Quantity(definition);
speed.units(); // "m/s"
```

Incomplete input can produce `undefined` from the default parser even though its declared return type is `QuantityDefinition`. Unknown units and syntax errors may throw instead. When parsing user input directly, handle both cases.

Definitions use internal tokens such as `<meter>` and `<1>`, not display aliases such as `m`. The constructor can share a definition's arrays; do not mutate them after constructing a quantity.

## Understand the guards

{@link guards.isQuantity | isQuantity} checks the shared core class across all configured entry points and safely accepts nullish values. It does not recognize plain definitions or instances from a different installed copy of the library.

{@link guards.isQuantityDefinition | isQuantityDefinition} only checks that a `scalar` property is defined. It does not validate Decimal values or token arrays, and throws on `null` or `undefined`. It is a shallow discriminator, not a validator for external JSON.

Existing Quantity operands and conversion targets are processed from their tokens,
without passing formatted unit strings to the parser. Custom parsers only need to
understand the strings supplied by their callers.
