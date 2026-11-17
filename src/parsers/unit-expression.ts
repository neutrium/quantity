import type { ScalarExpression } from './scalar-expression.js';
import type { UnitStructure, UnitPower, UnitExponent } from '../QuantityDefinition.js';
import { accumulateBasePower, normalizePowers, completeNormalizedUnits } from '../operations/unit-powers.js';
import { addExponents, multiplyExponents, absExponent, exponentSign } from '../operations/exponents.js';
import { ExpressionIssue } from './QuantityParseError.js';

type UnitProduct = {
	readonly left: UnitExpression;
	readonly right: UnitExpression;
	readonly divide: boolean;
};

// Products and powers retain their operands until the parse plan is built. Completed
// nodes also carry their counted units so successful parses can reuse the arrays.
type UnitExpression = UnitProduct | UnitStructure & (UnitProduct | { offset: number } |
	{ base: UnitExpression; exponent: UnitExponent });

export interface QuantityExpression
{
	scalar: ScalarExpression;
	units: UnitExpression;
	/** Retain syntactic unit presence even after zero powers or cancellation. */
	hasUnits?: boolean;
	absoluteUnit?: string;
	/** A following bare temperature unit labels a scalar literal without arithmetic. */
	bareTemperature?: boolean;
	/** Scalar preceding a juxtaposed literal 1 that may start a reciprocal unit such as 1/s. */
	beforeReciprocalUnit?: ScalarExpression;
	temperatureError?: string;
	/** First token, relative to the prepared input so cached diagnostics can be relocated. */
	offset: number;
	/** A leading unparenthesized sign requires an explicit multiplication operator. */
	signed?: boolean;
}

/** Reuse unit arrays for simple disjoint sides; defer products that require merging. */
export function combineUnitExpressions(left: UnitExpression, right: UnitExpression, divide = false): UnitExpression
{
	if ('numerator' in left && 'numerator' in right)
	{
		const rightNum = divide ? right.denominator : right.numerator;
		const rightDen = divide ? right.numerator : right.denominator;

		if (!left.numerator.length && !left.denominator.length && !divide)
		{
			return right;
		}

		if (!rightNum.length && !rightDen.length)
		{
			return left;
		}

		if ((!left.numerator.length || !rightNum.length) && (!left.denominator.length || !rightDen.length))
		{
			return {
				numerator: left.numerator.length ? left.numerator : rightNum,
				denominator: left.denominator.length ? left.denominator : rightDen,
				left, right, divide,
			};
		}
	}

	return { left, right, divide };
}

/** Consolidate once at a completed parse or powered-group boundary, without recursive traversal. */
export function resolveUnitExpression(expression: UnitExpression): UnitStructure
{
	try
	{
		if ('numerator' in expression)
		{
			return completeNormalizedUnits(expression);
		}
		const numerator: UnitPower[] = [], denominator: UnitPower[] = [];
		const pending: UnitExpression[] = [expression];
		const inversions = [false];

		while (pending.length)
		{
			const current = pending.pop()!, inverse = inversions.pop()!;
			if ('numerator' in current)
			{
				for (const term of current.numerator)
				{
					(inverse ? denominator : numerator).push(term);
				}
				for (const term of current.denominator)
				{
					(inverse ? numerator : denominator).push(term);
				}
			}
			else
			{
				pending.push(current.right, current.left);
				inversions.push(inverse !== current.divide, inverse);
			}
		}
		return completeNormalizedUnits({
			numerator: normalizePowers(numerator),
			denominator: normalizePowers(denominator)
		});
	}
	catch (error)
	{
		if (error instanceof RangeError)
		{
			locateOverflow(expression);
		}

		throw error;
	}
}

/** Replay only a rejected expression, counting both unit tokens and base dimensions in source order. */
function locateOverflow(expression: UnitExpression): void
{
	const units = [new Map<string, UnitExponent>(), new Map<string, UnitExponent>()];
	const base = [new Map<string, UnitExponent>(), new Map<string, UnitExponent>()];
	type Power = { magnitude: UnitExponent; outer?: Power };
	const pending: { node: UnitExpression; inverse: boolean; powers?: Power }[] = [{ node: expression, inverse: false }];

	while (pending.length)
	{
		const { node, inverse, powers } = pending.pop()!;

		if ('left' in node)
		{
			pending.push({ node: node.right, inverse: inverse !== node.divide, powers }, { node: node.left, inverse, powers });
		}
		else if ('base' in node)
		{
			if (node.exponent !== 0)
			{
				pending.push({
					node: node.base,
					inverse: inverse !== (exponentSign(node.exponent) < 0),
					powers: {
						magnitude: absExponent(node.exponent),
						outer: powers
					}
				});
			}
		}
		else if (node.numerator.length)
		{
			const term = node.numerator[0], side = inverse ? 1 : 0;

			try
			{
				let exponent = term.exponent;
				for (let power = powers; power; power = power.outer)
				{
					exponent = multiplyExponents(exponent, power.magnitude);
				}

				const key = (term.prefix ?? '') + term.unit;
				units[side].set(key, addExponents(units[side].get(key) ?? 0, exponent));
				accumulateBasePower({ ...term, exponent }, base[side], base[1 - side]);
			}
			catch (error)
			{
				if (error instanceof RangeError)
				{
					throw new ExpressionIssue('INVALID_EXPONENT', node.offset, error.message);
				}

				throw error;
			}
		}
	}
}
