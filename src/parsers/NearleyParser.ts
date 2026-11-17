import Nearley from 'nearley';
import grammar from './qty-grammar.js';
import { ExpressionParser } from './ExpressionParser.js';
import { createExpressionEngine } from './expression-plan.js';
import { QuantityParseError } from './QuantityParseError.js';
import { parsingError } from './expression-diagnostics.js';
import type { PreparedExpression } from './PreparedExpression.js';
import type { ParserConfigInput } from './ParserConfig.js';
import type { QuantityExpression } from './unit-expression.js';

export { QuantityParseError, type QuantityParseErrorCode, type QuantityParseResult } from './QuantityParseError.js';
export type { ParserConfigInput, ParserConfig, ParserCacheStats, ParserCacheConfigInput } from './ParserConfig.js';

// Nearley 2 exposes its parse columns at runtime but omits them from its typings.
interface ParseColumn
{
	scannable: {
		rule: {
			symbols: unknown[]
		};
		dot: number
	}[];
}

function expectedTokens(parser: Nearley.Parser): string[]
{
	const state = parser as Nearley.Parser & { table?: (ParseColumn | undefined)[] };
	const column = state.table?.[state.current];
	const result = new Set<string>();

	for (const item of column?.scannable ?? [])
	{
		const symbol = item.rule.symbols[item.dot];

		if (symbol && typeof symbol === 'object' && 'type' in symbol && typeof symbol.type === 'string' && symbol.type !== 'ws')
		{
			result.add(symbol.type);
		}
	}

	return [...result].sort();
}

function incompleteExpression(input: string, prepared: PreparedExpression, parser: Nearley.Parser): QuantityParseError
{
	const expected = expectedTokens(parser);

	if (prepared.last?.type === 'pwr')
	{
		return new QuantityParseError('UNEXPECTED_END', input, input.length, 'Expected an exponent', expected);
	}

	const closing = expected.includes('rParen');

	return new QuantityParseError('UNEXPECTED_END', input, input.length,
		closing ? 'Expected closing parenthesis' : 'Expected a complete expression', closing ? [')'] : expected);
}

let compiledGrammar: Nearley.Grammar | undefined;

const engine = createExpressionEngine((prepared, input) => {
	const compiled = compiledGrammar ??= Nearley.Grammar.fromCompiled({ ...grammar, Lexer: undefined });
	const parser = new Nearley.Parser(compiled, { lexer: prepared });

	try
	{
		parser.feed(input);
	}
	catch (error)
	{
		throw parsingError(error, input, prepared, expectedTokens(parser));
	}

	if (!parser.results.length)
	{
		throw incompleteExpression(input, prepared, parser);
	}

	if (parser.results.length !== 1)
	{
		throw new QuantityParseError('AMBIGUOUS_EXPRESSION', input, 0, 'Expression has more than one interpretation');
	}

	return parser.results[0] as QuantityExpression;
});

/**
 * Parser for scalar products/division, compound units, powers, and nested groups.
 * Powers bind first, then dot products; * / and whitespace evaluate left to right.
 * Compiled expression plans are shared within a configuration; scalar evaluation follows
 * the original operation order and the selected numeric adapter on every call.
 */
export class NearleyParser extends ExpressionParser
{
	/**
	 * Create a parser with optional cache limits.
	 * Omitted options share the default configuration. Separately supplied option
	 * objects isolate retention; passing an already resolved configuration reuses it.
	 * @example
	 * ```ts
	 * const parser = new NearleyParser({ cache: { maxEntries: 128 } });
	 * parser.config.cache.maxEntries; // 128
	 * ```
	 */
	constructor(config?: ParserConfigInput)
	{
		super(config, engine);
	}
}
