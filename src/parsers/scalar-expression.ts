import type { UnitExponent } from '../QuantityDefinition.js';
import { parseExponent } from '../operations/exponents.js';
import type { ScientificAdapter } from '@neutrium/math/numeric/scientific';
import { rationalPower } from '../numeric/support.js';
import type { ArithmeticAdapter } from '@neutrium/math/numeric/arithmetic';
import type { Token } from 'moo';
import { temperatureChecks, type ParsedTemperatureChecks } from '../operations/temperature-units.js';
import { BelowAbsoluteZeroError, TemperatureRangeError, scaleTemperatureReading } from '../operations/temperature.js';
import { CacheScope, defaultCacheScope } from '../utils/CacheScope.js';
import { ExpressionIssue } from './QuantityParseError.js';

// This value is injected only after lexing a leading number; it cannot be lexed from input.
export const INPUT_SCALAR = '\u0000input';
type ScalarOperator = 'multiply' | 'divide';
type BinaryInstruction = { kind: ScalarOperator; offset: number }
	| { kind: 'temperatureScale'; unit: string; divide: boolean; temperatureOnRight: boolean; offset: number };
type UnaryInstruction = { kind: 'negate'; unit?: string; offset: number }
	| { kind: 'temperatureReading'; unit: string; offset: number }
	| { kind: 'power'; text?: string; error: string; offset: number }
	| { kind: 'rationalPower'; exponent: UnitExponent; offset: number };
export type ScalarExpression = { kind: 'literal'; text: string; offset: number }
	| { kind: 'input' }
	| (UnaryInstruction & { base: ScalarExpression })
	| (BinaryInstruction & { left: ScalarExpression; right: ScalarExpression });
export const ONE: ScalarExpression = Object.freeze({ kind: 'literal', text: '1', offset: 0 });

export function scalarToken(token: Token): ScalarExpression
{
	return token.value === INPUT_SCALAR ? { kind: 'input' } : { kind: 'literal', text: token.value, offset: token.offset };
}

/** Keep scalar errors deferred: a supplied scalar skips evaluation, including its powers. */
export function scalarPower(base: ScalarExpression, text: string, offset: number): ScalarExpression
{
	try
	{
		return {
			kind: 'rationalPower',
			base,
			exponent: parseExponent(text),
			offset
		};
	}
	catch (error)
	{
		if (!(error instanceof RangeError || error instanceof TypeError))
		{
			throw error;
		}

		// Only scientific adapters can evaluate literals beyond the unit-exponent range.
		const literal = error instanceof RangeError && !text.includes('/') ? text : undefined;

		return {
			kind: 'power',
			base,
			text: literal,
			error: error.message,
			offset
		};
	}
}

export function scalarOperation(kind: ScalarOperator, left: ScalarExpression, right: ScalarExpression, offset: number): ScalarExpression
{
	// Only bare units carry a structural identity. Explicit literals belong to the adapter.
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

type Instruction = Exclude<ScalarExpression, { left: ScalarExpression } | { base: ScalarExpression }>
	| BinaryInstruction | UnaryInstruction;
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
			const { left, right, ...instruction } = node;
			pending.push(instruction, right, left);
		}
		else if ('base' in node)
		{
			const { base, ...instruction } = node;
			pending.push(instruction, base);
		}
		else
		{
			result.push(node);
		}
	}

	return result;
}

function scalarLiteral<T>(text: string, offset: number, Numeric: ArithmeticAdapter<T>): T
{
	try
	{
		return Numeric.from(text.startsWith('+') ? text.slice(1) : text);
	}
	catch (error)
	{
		throw new ExpressionIssue('INVALID_SCALAR', offset, (error as Error).message);
	}
}

/** Classify a rejected division without inspecting divisors on the successful path. */
function isZeroDivisor<T>(numeric: ArithmeticAdapter<T>, divisor: T): boolean
{
	try
	{
		return numeric.compare(divisor, numeric.from(0)) === 0;
	}
	catch
	{
		return false;
	} // Keep the original adapter failure if zero cannot be compared.
}

/** Return the ordinary scalar for a physically invalid parse; Quantity raises the deferred error. */
function parsedTemperatureScale<T>(unit: string, reading: T, factor: T, divide: boolean, n: ArithmeticAdapter<T>,
	scope: CacheScope, checks: ParsedTemperatureChecks<T>): T
{
	try
	{
		return scaleTemperatureReading(unit, reading, factor, divide, n, scope);
	}
	catch (error)
	{
		if (!(error instanceof BelowAbsoluteZeroError || error instanceof TemperatureRangeError))
		{
			throw error;
		}

		checks[temperatureChecks] = error;

		return divide ? n.div(reading, factor) : n.mul(reading, factor);
	}
}

/** The same evaluator serves grammar results, cache misses, and cache hits. */
export function evaluateScalar<T>(program: ScalarProgram, input: string, Numeric: ArithmeticAdapter<T>, checks: ParsedTemperatureChecks<T>, scope: CacheScope = defaultCacheScope): T
{
	const first = program[0];

	if (program.length === 1)
	{
		if (first.kind === 'input')
		{
			return scalarLiteral(input, -1, Numeric);
		}

		if (first.kind === 'literal')
		{
			return scalarLiteral(first.text, first.offset, Numeric);
		}
	}

	const stack: T[] = [];

	for (const instruction of program)
	{
		if (instruction.kind === 'input')
		{
			stack.push(scalarLiteral(input, -1, Numeric));
		}
		else if (instruction.kind === 'literal')
		{
			stack.push(scalarLiteral(instruction.text, instruction.offset, Numeric));
		}
		else if (instruction.kind === 'temperatureReading')
		{
			const readings = checks[temperatureChecks] ??= [];

			if (Array.isArray(readings))
			{
				readings.push({ unit: instruction.unit, scalar: stack[stack.length - 1] });
			}
		}
		else if (instruction.kind === 'negate' || instruction.kind === 'power' || instruction.kind === 'rationalPower')
		{
			const base = stack.pop()!;

			try
			{
				if (instruction.kind === 'negate')
				{
					stack.push(instruction.unit ? parsedTemperatureScale(instruction.unit, base, Numeric.from(-1), false, Numeric, scope, checks)
						: Numeric.neg(base));
				}
				else if (instruction.kind === 'rationalPower')
				{
					stack.push(rationalPower(Numeric, base, instruction.exponent));
				}
				else
				{
					if (instruction.text === undefined || Numeric.tier !== 'scientific')
					{
						throw new Error(instruction.error);
					}

					stack.push((Numeric as ScientificAdapter<T>).pow(base, instruction.text));
				}
			}
			catch (error)
			{
				throw new ExpressionIssue('INVALID_SCALAR', instruction.offset, (error as Error).message);
			}
		}
		else
		{
			const right = stack.pop()!, left = stack.pop()!;
			const divide = instruction.kind === 'temperatureScale' ? instruction.divide : instruction.kind === 'divide';

			try
			{
				if (instruction.kind === 'temperatureScale')
				{
					const reading = instruction.temperatureOnRight ? right : left;
					const factor = instruction.temperatureOnRight ? left : right;
					stack.push(parsedTemperatureScale(instruction.unit, reading, factor, divide, Numeric, scope, checks));
					continue;
				}

				stack.push(divide ? Numeric.div(left, right) : Numeric.mul(left, right));
			}
			catch (error)
			{
				const code = divide && isZeroDivisor(Numeric, right) ? 'DIVISION_BY_ZERO' : 'INVALID_SCALAR';
				throw new ExpressionIssue(code, instruction.offset, (error as Error).message);
			}
		}
	}
	return stack[0];
}
