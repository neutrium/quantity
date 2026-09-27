import type { DecimalConstructor } from '../operations/numeric-context.js';
import { Decimal } from '@neutrium/decimal';
import type { Token } from 'moo';
import { ExpressionIssue } from './QuantityParseError.js';

// This value is injected only after lexing a leading number; it cannot be lexed from input.
export const INPUT_SCALAR = '\u0000input';
export type ScalarOperator = 'multiply' | 'divide';
export type ScalarExpression = { kind: 'literal'; text: string; offset: number }
	| { kind: 'input' }
	| { kind: 'negate'; base: ScalarExpression; offset: number }
	| { kind: ScalarOperator; left: ScalarExpression; right: ScalarExpression; offset: number }
	| { kind: 'power'; base: ScalarExpression; text: string; offset: number };
export const ONE: ScalarExpression = Object.freeze({ kind: 'literal', text: '1', offset: 0 });

export function scalarToken(token: Token): ScalarExpression
{
	if (token.value === '1')
	{
		return ONE;
	}

	return token.value === INPUT_SCALAR ? { kind: 'input' } : { kind: 'literal', text: token.value, offset: token.offset };
}

export function scalarOperation(kind: ScalarOperator, left: ScalarExpression, right: ScalarExpression, offset: number): ScalarExpression
{
	// Eliminate identity factors, but do not reassociate arithmetic or fold
	// nontrivial constants: Decimal precision can change between calls.
	if (kind === 'multiply' && left === ONE)
	{
		return right;
	}

	if (right === ONE)
	{
		return left;
	}

	return { kind, left, right, offset };
}

/** Keep the exponent literal intact: Decimal applies range limits to power results. */
export function scalarPower(base: ScalarExpression, exponent: Token): ScalarExpression
{
	const text = exponent.value.startsWith('+') ? exponent.value.slice(1) : exponent.value;

	return {
		kind: 'power',
		base,
		text,
		offset: exponent.offset
	};
}

type Instruction = Exclude<ScalarExpression, { left: ScalarExpression } | { base: ScalarExpression }>
	| { kind: ScalarOperator; offset: number }
	| { kind: 'negate'; offset: number }
	| { kind: 'power'; text: string; offset: number };
export type ScalarProgram = readonly Instruction[];

/** Compile iteratively so long products never consume the JavaScript call stack. */
export function compileScalar(expression: ScalarExpression): ScalarProgram
{
	const result: Instruction[] = [];
	const pending: (ScalarExpression | Instruction)[] = [expression];

	while (pending.length)
	{
		const node = pending.pop()!;
		if ('left' in node)
		{
			pending.push({ kind: node.kind, offset: node.offset }, node.right, node.left);
		}
		else if ('base' in node)
		{
			pending.push(
				node.kind === 'power'
					? { kind: 'power', text: node.text, offset: node.offset }
					: { kind: 'negate', offset: node.offset }, node.base
			);
		}
		else
		{
			result.push(node);
		}
	}
	return result;
}

function decimal(text: string, offset: number, Numeric: DecimalConstructor): Decimal
{
	try
	{
		return new Numeric(text.startsWith('+') ? text.slice(1) : text);
	}
	catch (error)
	{
		throw new ExpressionIssue('INVALID_SCALAR', offset, (error as Error).message);
	}
}

/** The same evaluator serves grammar results, cache misses, and cache hits. */
export function evaluateScalar(program: ScalarProgram, input = '1', Numeric: DecimalConstructor = Decimal): Decimal
{
	const first = program[0];

	if (program.length === 1)
	{
		if (first.kind === 'input')
		{
			return decimal(input, -1, Numeric);
		}

		if (first.kind === 'literal')
		{
			return decimal(first.text, first.offset, Numeric);
		}
	}

	const stack: Decimal[] = [];

	for (const instruction of program)
	{
		if (instruction.kind === 'input')
		{
			stack.push(decimal(input, -1, Numeric));
		}
		else if (instruction.kind === 'literal')
		{
			stack.push(decimal(instruction.text, instruction.offset, Numeric));
		}
		else if (instruction.kind === 'negate')
		{
			stack.push(stack.pop()!.neg());
		}
		else if (instruction.kind === 'power')
		{
			const base = stack.pop()!;
			try
			{
				stack.push(base.pow(instruction.text));
			}
			catch (error)
			{
				throw new ExpressionIssue('INVALID_SCALAR', instruction.offset, (error as Error).message);
			}
		}
		else
		{
			const right = stack.pop()!, left = stack.pop()!;

			if (instruction.kind === 'divide' && right.isZero())
			{
				throw new ExpressionIssue('DIVISION_BY_ZERO', instruction.offset, 'Cannot divide by zero');
			}

			try
			{
				if (right.eq(1))
				{
					stack.push(left); continue;
				}

				if (instruction.kind === 'multiply' && left.eq(1))
				{
					stack.push(right); continue;
				}
				stack.push(instruction.kind === 'multiply' ? left.mul(right) : left.div(right));
			}
			catch (error)
			{
				throw new ExpressionIssue('INVALID_SCALAR', instruction.offset, (error as Error).message);
			}
		}
	}
	return stack[0];
}
