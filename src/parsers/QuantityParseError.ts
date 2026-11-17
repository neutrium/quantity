/** Stable categories for syntax and expression-evaluation failures. */
export type QuantityParseErrorCode = 'INVALID_INPUT' | 'UNEXPECTED_TOKEN' | 'UNEXPECTED_END'
	| 'LIMIT_EXCEEDED' | 'UNKNOWN_UNIT' | 'INVALID_EXPONENT' | 'DIVISION_BY_ZERO' | 'INVALID_SCALAR' | 'AMBIGUOUS_EXPRESSION';

/**
 * An expression parsing failure located in the original input.
 * `offset` uses zero-based UTF-16 indices; `line` and `column` are one-based.
 * Use `code` for application logic and `message` for a source line with a caret.
 * Quantity's dimensional and temperature validation errors are separate.
 * @example
 * ```ts
 * import { Quantity } from '@neutrium/quantity';
 * import { QuantityParseError } from '@neutrium/quantity/parsers/pratt';
 * try
 * {
 *     new Quantity('kg/(m*s');
 * }
 * catch (error)
 * {
 *     if (error instanceof QuantityParseError)
 * {
 *         error.code; // "UNEXPECTED_END"
 *         error.input; // "kg/(m*s"
 *     }
 * }
 * ```
 */
export class QuantityParseError extends SyntaxError
{
	/** One-based line in the original input. */
	readonly line: number;
	/** One-based UTF-16 column in the original input. */
	readonly column: number;

	constructor(
		/** Stable category suitable for application logic. */
		readonly code: QuantityParseErrorCode,
		/** Original expression, without Unicode or whitespace normalization. */
		readonly input: string,
		/** Zero-based UTF-16 index of the error, or input.length for missing input. */
		readonly offset: number,
		reason: string,
		/** Expected token hints when available; empty for evaluation failures. */
		readonly expected: readonly string[] = [],
	) {
		const breaks = /\r\n|[\r\n\u2028\u2029]/g;
		let line = 1, start = 0;
		let next = breaks.exec(input);

		while (next && breaks.lastIndex <= offset)
		{
			line++;
			start = breaks.lastIndex;
			next = breaks.exec(input);
		}

		const column = offset - start + 1;
		const source = input.slice(start, next?.index ?? input.length);

		super(`${reason} at ${line}:${column}\n${source}\n${' '.repeat(column - 1)}^`);
		this.name = 'QuantityParseError';
		this.line = line;
		this.column = column;
	}
}

/** Discriminated result returned by NearleyParser.tryParse() and PrattParser.tryParse(). */
export type QuantityParseResult<T> = {
	/** True when the expression was parsed and evaluated successfully. */
	success: true;
	/** Parsed value, suitable for constructing a Quantity. */
	value: T;
} | {
	/** False when parsing or expression evaluation failed. */
	success: false;
	/** Structured failure located in the original input. */
	error: QuantityParseError;
};

/** Internal error using expression-relative offsets, safe to store in cached plans. */
export class ExpressionIssue extends Error
{
	constructor(readonly code: QuantityParseErrorCode, readonly offset: number, message: string) { super(message); }
}
