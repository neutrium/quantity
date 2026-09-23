import Nearley from 'nearley/lib/nearley.js';
import grammar from './qty-grammar.js';
import { QuantityDefinition } from '../QuantityDefinition.js'

/**
 * Default parser for compound units, integer exponents, and parenthesized groups.
 *
 * Parenthesized groups currently require a following integer exponent; use `^1`
 * when grouping without changing the power.
 *
 * Import from `@neutrium/quantity/parsers.js`. Pass an instance as the third
 * argument to {@link Quantity.Quantity.constructor | Quantity constructor}, or call {@link parse} directly
 * when a parsed definition is needed.
 *
 * @example
 * ```ts
 * import { Quantity } from '@neutrium/quantity';
 * import { NearleyQtyParser } from '@neutrium/quantity/parsers.js';
 *
 * const parser = new NearleyQtyParser();
 * const force = new Quantity('2 (kg*m/s^2)^1', undefined, parser);
 * force.to('N').scalar.toString(); // "2"
 * ```
 */
export class NearleyQtyParser
{
	constructor() { }

	/**
	 * Parse an expression into a scalar and normalized unit tokens.
	 * @param val - Expression such as `"2 kg*m/s^2"`, `"m"`, or `"2"`.
	 * @returns The first complete parse result. Incomplete expressions can return
	 * `undefined` at runtime despite the declared return type; check direct parser
	 * results before using them.
	 * @throws If the parser rejects the expression or encounters an unknown unit.
	 * @remarks Parsing alone does not enforce Quantity's absolute-temperature
	 * restrictions. Construct a Quantity when validating a complete physical value.
	 */
	public parse(val: string) : QuantityDefinition
	{
		// You have to create a new parser each time to reset the state
		const parser = new Nearley.Parser(Nearley.Grammar.fromCompiled(grammar))

		parser.feed(val);

		const results = <QuantityDefinition | undefined>parser.results;

		if(results === undefined)
		{
			throw new Error("Unit not recognized");
		}
		else
		{
			return results[0];
		}
	}
}


