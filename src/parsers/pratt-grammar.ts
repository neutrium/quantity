import { createPrattParser, ParseError, MAX_PRATT_DEPTH, type PrattContext, type InfixParselet } from '@neutrium/utilities/parsing';
import type { Token } from 'moo';
import type { PreparedExpression } from './PreparedExpression.js';
import type { QuantityExpression } from './unit-expression.js';
import { numberExpression, unitExpression, product, implicitProduct, power, group, signedGroup, reciprocal } from './quantity-expression.js';
import { QuantityParseError } from './QuantityParseError.js';

type PrattToken = Token & { start: number; end: number; spaced: boolean };
type Context = PrattContext<PrattToken, QuantityExpression>;
const isNumber = (token: Token) => token.type === 'integer' || token.type === 'signedFloat';
const isUnitBase = (token: Token) => ['unit', 'lParen', 'sign'].includes(token.type!);

// Utilities errors are immutable; retain grammar-specific hints separately.
const hints = new WeakMap<ParseError, readonly string[]>();

function expectToken(context: Context, types: string[], message: string): PrattToken
{
	const token = context.peek();

	if (!token || !types.includes(token.type!))
	{
		const error = new ParseError(token ? 'UNEXPECTED_TOKEN' : 'UNEXPECTED_END', message, context.span());
		hints.set(error, types);
		throw error;
	}

	return context.consume();
}

function exponent(context: Context): Token
{
	const token = expectToken(context, ['integer', 'lParen', 'signedFloat'], 'Expected an exponent');

	if (token.type !== 'lParen')
	{
		return token;
	}

	const numerator = expectToken(context, ['integer'], 'Expected an integer numerator');
	expectToken(context, ['div'], 'Expected / in a rational exponent');
	const denominator = expectToken(context, ['integer'], 'Expected an integer denominator');
	expectToken(context, ['rParen'], 'Expected closing parenthesis');

	return { ...numerator, value: numerator.value + '/' + denominator.value };
}

function powered(context: Context, expression: QuantityExpression, units: boolean): QuantityExpression
{
	const next = context.peek();

	if (next?.type === 'pwr')
	{
		context.consume();
		return power(expression, exponent(context), units);
	}

	if (next && !next.spaced && (next.type === 'superscript' || units && next.type === 'integer'))
	{
		return power(expression, context.consume(), units);
	}

	return expression;
}

function unitFactor(context: Context, token: PrattToken): QuantityExpression
{
	if (token.type === 'sign')
	{
		const opening = expectToken(context, ['lParen'], 'Expected a signed group');
		return signedGroup(token, unitFactor(context, opening));
	}

	let expression: QuantityExpression;

	if (token.type === 'lParen')
	{
		expression = group(context.parseExpression(), token.offset);
		expectToken(context, ['rParen'], 'Expected closing parenthesis');
	}
	else
	{
		expression = unitExpression(token);
	}

	return powered(context, expression, true);
}

function factor(context: Context, token: PrattToken): QuantityExpression
{
	if (!isNumber(token))
	{
		return unitFactor(context, token);
	}

	let expression = powered(context, numberExpression(token), false);
	const next = context.peek();

	// 1/2m means 1/(2*m), whereas 1/2 m means (1/2)*m.
	if (next && !next.spaced && isUnitBase(next))
	{
		expression = implicitProduct(expression, unitFactor(context, context.consume()));
	}

	return expression;
}

function right(context: Context, bindingPower: number): QuantityExpression
{
	// A leading reciprocal is valid only at the start of a complete expression.
	if (context.peek()?.type === 'div')
	{
		context.unexpected('Expected a factor');
	}

	return context.parseExpression(bindingPower);
}

const multiply: InfixParselet<PrattToken, QuantityExpression> = {
	bindingPower: 10,
	parse: (context, left, token) => product(left, right(context, 11), token.type === 'div', token.offset),
};
const dot: InfixParselet<PrattToken, QuantityExpression> = {
	bindingPower: 20,
	parse: (context, left, token) => product(left, right(context, 21), false, token.offset),
};
const implicit: InfixParselet<PrattToken, QuantityExpression> = {
	bindingPower: 10, consumeToken: false,
	parse: (context, left) => implicitProduct(left, right(context, 11)),
};
const grammar = createPrattParser<PrattToken, QuantityExpression>({
	prefix: token => token.type === 'div'
		? (context, token) => reciprocal(right(context, 11), token.offset)
		: isNumber(token) || isUnitBase(token) ? factor : undefined,
	infix: token => token.type === 'mul' || token.type === 'div' ? multiply
		: token.type === 'dot' ? dot
		: token.spaced && (isNumber(token) || isUnitBase(token)) ? implicit : undefined,
}, { maxDepth: MAX_PRATT_DEPTH, maxTokens: Number.MAX_SAFE_INTEGER });

/** Stream once, retaining whitespace only where it affects adjacency. */
export function parsePrattExpression(prepared: PreparedExpression, input: string): QuantityExpression
{
	const source = {
		next(): PrattToken | undefined {
			let token = prepared.next(), spaced = false;

			while (token?.type === 'ws')
			{
				spaced = true;
				token = prepared.next();
			}

			if (!token)
			{
				return undefined;
			}

			if (token.type === 'invalid')
			{
				throw new QuantityParseError('UNKNOWN_UNIT', input, prepared.sourceOffset(token.offset),
					`Unknown unit or symbol ${JSON.stringify(token.value)}`);
			}

			const result = token as PrattToken;
			result.start = prepared.sourceOffset(token.offset);
			result.end = result.start + token.text.length;
			result.spaced = spaced;

			return result;
		},
	};

	try
	{
		return grammar.parse(source, { end: input.length });
	}
	catch (error)
	{
		if (error instanceof ParseError)
		{
			let expected = hints.get(error)?.map(type => type === 'rParen' ? ')' : type);

			if (error.code === 'UNEXPECTED_END' && error.reason === 'EXPECTED_EXPRESSION')
			{
				expected = ['integer', 'lParen', 'sign', 'signedFloat', 'unit'];
				// A reciprocal can start a complete expression, including one inside a group.
				if (!prepared.last || prepared.last.type === 'lParen')
				{
					expected.unshift('div');
				}
			}

			throw new QuantityParseError(error.code, input, error.start, error.message, expected);
		}

		throw error;
	}
}
