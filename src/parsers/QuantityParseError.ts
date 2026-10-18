/** Stable categories for syntax and expression-evaluation failures. */
export type QuantityParseErrorCode = 'INVALID_INPUT' | 'UNEXPECTED_TOKEN' | 'UNEXPECTED_END'
	| 'UNKNOWN_UNIT' | 'INVALID_EXPONENT' | 'DIVISION_BY_ZERO' | 'INVALID_SCALAR' | 'AMBIGUOUS_EXPRESSION';

/**
 * A Nearley parsing failure located in the original input.
 * `offset` uses zero-based UTF-16 indices; `line` and `column` are one-based.
 * Use `code` for application logic and `message` for a source line with a caret.
 * Quantity's dimensional and temperature validation errors are separate.
 * @example
 * ```ts
 * import { Quantity } from '@neutrium/quantity';
 * import { QuantityParseError } from '@neutrium/quantity/parsers/nearley';
 * try {
 *     new Quantity('kg/(m*s');
 * } catch (error) {
 *     if (error instanceof QuantityParseError) {
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
		const before = input.slice(0, offset);
		const line = before.split('\n').length;
		const column = offset - before.lastIndexOf('\n');
		const source = input.split('\n')[line - 1] ?? '';

		super(`${reason} at ${line}:${column}\n${source}\n${' '.repeat(column - 1)}^`);
		this.name = 'QuantityParseError';
		this.line = line;
		this.column = column;
	}
}

/** Discriminated result returned by NearleyParser.tryParse(). */
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
