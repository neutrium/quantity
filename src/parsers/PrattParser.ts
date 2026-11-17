import { ExpressionParser } from './ExpressionParser.js';
import { createExpressionEngine } from './expression-plan.js';
import { parsePrattExpression } from './pratt-grammar.js';
import type { ParserConfigInput } from './ParserConfig.js';

export { QuantityParseError, type QuantityParseErrorCode, type QuantityParseResult } from './QuantityParseError.js';
export type { ParserConfigInput, ParserConfig, ParserCacheStats, ParserCacheConfigInput } from './ParserConfig.js';

const engine = createExpressionEngine(parsePrattExpression);

/**
 * Utilities Pratt engine with quantity tokenization, scalar arithmetic and nested groups.
 * The 256-level depth limit includes the outer expression, nested groups and active right operands.
 * Flat products and quotients reuse those levels as parsing advances.
 * Powers bind first, then dot products; * / and whitespace evaluate left to right.
 * Compiled expression plans are shared within a configuration; scalar evaluation follows
 * the original operation order and the selected numeric adapter on every call.
 */
export class PrattParser extends ExpressionParser
{
	/**
	 * Create a parser with optional cache limits.
	 * Omitted options share the default configuration. Separately supplied option
	 * objects isolate retention; passing an already resolved configuration reuses it.
	 * @example
	 * ```ts
	 * const parser = new PrattParser({ cache: { maxEntries: 128 } });
	 * parser.config.cache.maxEntries; // 128
	 * ```
	 */
	constructor(config?: ParserConfigInput)
	{
		super(config, engine);
	}
}
