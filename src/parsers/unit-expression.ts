import type { ScalarExpression } from './scalar-expression.js';
import type { UnitStructure, UnitPower } from '../QuantityDefinition.js';
import { normalizePowers } from '../operations/unit-powers.js';

/** Internal immutable parse tree: products retain operands instead of copying their units. */
export type UnitExpression = UnitStructure | {
	readonly left: UnitExpression;
	readonly right: UnitExpression;
	readonly divide: boolean;
};

export interface QuantityExpression
{
	scalar: ScalarExpression;
	units: UnitExpression;
	/** Retain syntactic unit presence even after zero powers or cancellation. */
	hasUnits?: boolean;
	/** Sign on the first unparenthesized factor, for implicit-multiplication checks. */
	signOffset?: number;
}

/** Reuse unit arrays for simple disjoint sides; defer products that require merging. */
export function combineUnitExpressions(left: UnitExpression, right: UnitExpression, divide = false): UnitExpression
{
	if ('numerator' in left && 'numerator' in right)
	{
		const rightNum = divide ? right.denominator : right.numerator;
		const rightDen = divide ? right.numerator : right.denominator;

		if ((!left.numerator.length || !rightNum.length) && (!left.denominator.length || !rightDen.length))
		{
			return {
				numerator: left.numerator.length ? left.numerator : rightNum,
				denominator: left.denominator.length ? left.denominator : rightDen
			};
		}
	}
	return { left, right, divide };
}

/** Consolidate once at a completed parse or powered-group boundary, without recursive traversal. */
export function resolveUnitExpression(expression: UnitExpression): UnitStructure
{
	if ('numerator' in expression)
	{
		return expression;
	}

	const numerator: UnitPower[] = [], denominator: UnitPower[] = [];
	const pending: UnitExpression[] = [expression];
	const inversions = [false];

	while (pending.length)
	{
		const current = pending.pop()!;
		const inverse = inversions.pop()!;

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
			// Visit left first to preserve the first-occurrence order on each side.
			pending.push(current.right, current.left);
			inversions.push(inverse !== current.divide, inverse);
		}
	}
	// Keep numerator and denominator separate; parsing does not cancel units.
	// Normalization validates summed counts and returns frozen records and arrays.
	return {
		numerator: normalizePowers(numerator),
		denominator: normalizePowers(denominator)
	};
}
