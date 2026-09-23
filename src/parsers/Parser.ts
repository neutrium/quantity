/**
 * Structural contract for a parser supplied to the Quantity constructor.
 * @typeParam Result - Parsed output; Quantity requires a QuantityDefinition shape.
 * @remarks This interface is documented as a supporting type and is not exported
 * from a public entry point. Pass an object with a compatible `parse` method;
 * an explicit `implements Parser` declaration is unnecessary.
 * @see {@link parsers.NearleyQtyParser | NearleyQtyParser} for the default implementation.
 * @see {@link parsers.RegexQtyParser | RegexQtyParser} for the legacy implementation.
 */
export interface Parser<Result>
{
	/**
	 * Parse a scalar and unit expression.
	 * @param val - Expression supplied by the constructor. With a separate scalar,
	 * only the unit expression is passed and the returned scalar is replaced.
	 * @returns A complete result containing a Decimal scalar and normalized unit arrays.
	 * @throws Implementations should throw when input is invalid or incomplete.
	 */
	parse(val: string): Result
}
