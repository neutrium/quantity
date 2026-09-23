# Parsers and definitions

## Choose a parser

{@link parsers.NearleyQtyParser | NearleyQtyParser} is the default. It supports compound expressions, integer
powers, and parenthesized groups followed by an exponent, such as `(m/s)^2`. {@link parsers.RegexQtyParser | RegexQtyParser} is the legacy alternative and does not support parenthesized grouping.

```ts
import { Quantity } from '@neutrium/quantity';
import { RegexQtyParser } from '@neutrium/quantity/parsers.js';

const parser = new RegexQtyParser();
const speed = new Quantity('12 m/s', undefined, parser);
speed.scalar.toString(); // "12"

const length = new Quantity(3, 'm', parser);
length.units(); // "m"
```

The custom parser is used to construct that instance. Operations that create other quantities do not propagate it; parse nonstandard operands explicitly before passing them to arithmetic methods.

## Adapt input with a custom parser

A custom parser needs a `parse(string)` method returning a Decimal scalar and normalized `numerator` and `denominator` token arrays. Delegating to the default parser avoids depending on internal token names.

```ts
import { Quantity } from '@neutrium/quantity';
import { NearleyQtyParser } from '@neutrium/quantity/parsers.js';

const defaultParser = new NearleyQtyParser();
const parser = {
    parse(input: string)
	{
        const result = defaultParser.parse(input.replaceAll('metres', 'm'));
        if (!result)
        {
            throw new Error('Incomplete quantity expression');
		}
        return result;
    }
};

const length = new Quantity('3 metres', undefined, parser);
length.to('cm').scalar.toString(); // "300"
```

{@link "parsers/Parser".Parser | Parser} and {@link QuantityDefinition.QuantityDefinition | QuantityDefinition} document these structures but are not exported from the package entry points. TypeScript infers a compatible parser from the object above, so internal-path imports are unnecessary.

## Use parsed definitions

Direct parsing produces a definition, not a fully checked physical quantity. The Quantity constructor applies restrictions such as absolute zero and invalid compound temperature units.

```ts
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

{@link guards.isQuantity | isQuantity} checks `instanceof Quantity` and safely accepts nullish values. It does not recognize plain definitions or instances from a different installed copy of the library.

{@link guards.isQuantityDefinition | isQuantityDefinition} only checks that a `scalar` property is defined. It does not validate Decimal values or token arrays, and throws on `null` or `undefined`. It is a shallow discriminator, not a validator for external JSON.
