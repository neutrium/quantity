import { Quantity as QuantityCore } from './QuantityCore.js';
import { NearleyQtyParser } from './parsers/NearleyQtyParser.js';
import type { QuantityInitParam } from './guards.js';
import type { QuantityDefinition } from './QuantityDefinition.js';
import type { Parser } from './parsers/Parser.js';

/** Quantity configured with Nearley, the default package parser. */
export class Quantity extends QuantityCore
{
	/** Create a quantity, optionally overriding the default Nearley parser. */
	constructor(input: QuantityInitParam, units?: string, parser: Parser<QuantityDefinition> = new NearleyQtyParser())
	{
		super(input, units, parser);
	}
}
