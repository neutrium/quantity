import { Quantity as QuantityCore } from './QuantityCore.js';
import type { QuantityInitParam } from './guards.js';
import type { QuantityDefinition } from './QuantityDefinition.js';
import type { Parser } from './parsers/Parser.js';

export { QuantityCore };
export type { QuantityInitParam, QuantityDefinition, Parser };

/** Constructor returned by createQuantityClass, with an optional per-instance parser override. */
export interface QuantityConstructor
{
	/** Construct a quantity using the configured parser unless an override is supplied. */
	new (input: QuantityInitParam, units?: string, parser?: Parser<QuantityDefinition>): QuantityCore;
}

/**
 * Bind a Quantity class to a parser factory without importing a built-in parser.
 * The factory is called for each independently constructed quantity. Derived
 * quantities retain the originating instance's parser and configured class.
 */
export function createQuantityClass(createParser: () => Parser<QuantityDefinition>): QuantityConstructor
{
	return class Quantity extends QuantityCore
	{
		constructor(input: QuantityInitParam, units?: string, parser = createParser())
		{
			super(input, units, parser);
		}
	};
}
