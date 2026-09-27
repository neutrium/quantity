import type Nearley from 'nearley';
import type { Token } from 'moo';
import type { PreparedExpression } from './PreparedExpression.js';
import { ExpressionIssue, QuantityParseError } from './QuantityParseError.js';

// Nearley 2 exposes its parse columns at runtime but omits them from its typings.
// Keep that version-specific boundary here, with regression tests for EOF and
// rejected tokens. Do not derive public diagnostics from English error messages.
interface ParseColumn
{
	scannable: {
		rule: {
			symbols: unknown[]
		};
		dot: number
	}[];
}

export function expectedTokens(parser?: Nearley.Parser): string[]
{
	const state = parser as (Nearley.Parser & { table?: (ParseColumn | undefined)[] }) | undefined;
	const column = state?.table?.[state.current];
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

export function incompleteExpression(input: string, prepared: PreparedExpression, parser: Nearley.Parser): QuantityParseError
{
	const expected = expectedTokens(parser);

	if (prepared.last?.type === 'pwr')
	{
		return new QuantityParseError('UNEXPECTED_END', input, input.length, 'Expected an exponent', expected);
	}

	const closing = prepared.openGroups > 0 && ['unit', 'integer', 'signedFloat', 'superscript', 'rParen'].includes(prepared.last?.type ?? '');

	return new QuantityParseError('UNEXPECTED_END', input, input.length,
		closing ? 'Expected closing parenthesis' : 'Expected a complete expression', closing ? [')'] : expected);
}

export function parsingError(error: unknown, input: string, prepared?: PreparedExpression, parser?: Nearley.Parser): QuantityParseError
{
	if (error instanceof QuantityParseError)
	{
		return error;
	}

	if (error instanceof ExpressionIssue)
	{
		return new QuantityParseError(error.code, input, prepared?.sourceOffset(error.offset) ?? error.offset, error.message);
	}

	const failure = error as Error & { token?: Token };
	const token = failure?.token;
	const offset = token ? prepared?.sourceOffset(token.offset) ?? token.offset : input.length;

	if (error instanceof RangeError)
	{
		return new QuantityParseError('INVALID_EXPONENT', input, offset, failure.message);
	}

	// Unexpected implementation failures should not masquerade as bad input.
	if (!token)
	{
		throw error;
	}

	const unknown = token.type === 'invalid';

	return new QuantityParseError(unknown ? 'UNKNOWN_UNIT' : 'UNEXPECTED_TOKEN', input, offset,
		unknown ? `Unknown unit or symbol ${JSON.stringify(token.value)}` : `Unexpected ${JSON.stringify(token.text)}`,
		expectedTokens(parser));
}
