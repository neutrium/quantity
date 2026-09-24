import { Quantity as QuantityCore } from './QuantityCore.js';
import { RegexQtyParser } from './parsers/RegexQtyParser.js';
import type { QuantityInitParam } from './guards.js';
import type { QuantityDefinition } from './QuantityDefinition.js';
import type { Parser } from './parsers/Parser.js';

/** Quantity configured with the regular-expression parser. */
export class Quantity extends QuantityCore
{
	/** Create a quantity, optionally overriding the default regular-expression parser. */
	constructor(input: QuantityInitParam, units?: string, parser: Parser<QuantityDefinition> = new RegexQtyParser())
	{
		super(input, units, parser);
	}
}
