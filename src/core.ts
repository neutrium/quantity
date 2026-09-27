import type { DecimalConfigInput, DecimalConfig } from '@neutrium/decimal';
import { Quantity as QuantityCore } from './QuantityCore.js';
import type { QuantityInitParam } from './guards.js';
import type { QuantityDefinition } from './QuantityDefinition.js';
import type { Parser } from './parsers/Parser.js';
import type { ParserConfig } from './parsers/ParserConfig.js';
import type { QuantityConfigInput, CacheConfig } from './QuantityConfig.js';

export { QuantityCore };
export type { QuantityInitParam, QuantityDefinition, Parser };
export type { NumericStringifiable } from './guards.js';
export type { DecimalConfigInput, DecimalConfig, QuantityConfigInput };
export type { CacheConfigInput, CacheConfig } from './QuantityConfig.js';
export type { ParserConfigInput, ParserConfig, ParserCacheConfigInput, ParserCacheStats } from './parsers/ParserConfig.js';
export type { DecimalConstructor } from './operations/numeric-context.js';
export type { UnitPower, UnitStructure } from './QuantityDefinition.js';

/** Constructor returned by createQuantityClass, with an optional per-instance parser override. */
export interface QuantityConstructor
{
	/** Create a class with numerical and parser settings while retaining this parser factory. */
	withConfig<T extends new (...args: never[]) => QuantityCore>(this: T, config: QuantityConfigInput): T;
	/** Frozen snapshot of the class's effective Decimal settings. */
	readonly config: Readonly<DecimalConfig>;
	/** Immutable parser settings shared by this class and its default parser instances. */
	readonly parserConfig: ParserConfig;
	/** Immutable limits applied separately to each instance's conversion caches. */
	readonly conversionCacheConfig: CacheConfig;
	/** Construct a quantity using the configured parser unless an override is supplied. */
	new (input: QuantityInitParam, units?: string, parser?: Parser<QuantityDefinition>): QuantityCore;
}

/**
 * Bind a Quantity class to a parser factory without importing a built-in parser.
 * The factory is called for each independently constructed quantity. Derived
 * quantities retain the originating instance's parser and configured class. The factory
 * receives resolved parser settings; forward them to a configurable parser constructor.
 * Subclasses with extra constructor arguments must override the protected
 * `constructQuantity(input, units, parser)` hook to supply their own state when
 * creating operands and results. `withConfig()` preserves their constructor type.
 */
export function createQuantityClass(createParser: (config: ParserConfig) => Parser<QuantityDefinition>): QuantityConstructor
{
	return class Quantity extends QuantityCore
	{
		constructor(input: QuantityInitParam, units?: string, parser?: Parser<QuantityDefinition>)
		{
			super(input, units, parser === undefined ? createParser(new.target.parserConfig) : parser);
		}
	};
}
