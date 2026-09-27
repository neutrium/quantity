import { expect } from 'vitest';
import Nearley from 'nearley';
import grammar from '../../dist/parsers/qty-grammar.js';
import { resolveUnitExpression } from '../../dist/parsers/unit-expression.js';
import { compileScalar, evaluateScalar } from '../../dist/parsers/scalar-expression.js';

const compiled = Nearley.Grammar.fromCompiled(grammar);

// Bypass the wrapper and its caches to check the complete grammar independently.
export function parseExpression(input)
{
	const parser = new Nearley.Parser(compiled, { lexer: grammar.Lexer.clone() }).feed(input);
	expect(parser.results, input).toHaveLength(1);
	return parser.results[0];
}

export function fullParse(input)
{
	const expression = parseExpression(input);

	return {
		scalar: evaluateScalar(compileScalar(expression.scalar)),
		...resolveUnitExpression(expression.units),
	};
}
