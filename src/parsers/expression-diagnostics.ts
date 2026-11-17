import type { Token } from 'moo';
import type { PreparedExpression } from './PreparedExpression.js';
import { ExpressionIssue, QuantityParseError } from './QuantityParseError.js';

export function parsingError(error: unknown, input: string, prepared?: PreparedExpression, expected?: readonly string[]): QuantityParseError
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
		expected);
}
