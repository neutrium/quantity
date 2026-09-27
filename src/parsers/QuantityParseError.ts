/** Stable categories for syntax and expression-evaluation failures. */
export type QuantityParseErrorCode = 'INVALID_INPUT' | 'UNEXPECTED_TOKEN' | 'UNEXPECTED_END'
	| 'UNKNOWN_UNIT' | 'INVALID_EXPONENT' | 'DIVISION_BY_ZERO' | 'INVALID_SCALAR' | 'AMBIGUOUS_EXPRESSION';

/** A parsing error located in the original input (offsets use JavaScript UTF-16 indices). */
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

/** Discriminated result returned by NearleyQtyParser.tryParse(). */
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
