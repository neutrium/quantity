import type { Token } from 'moo';
import type { UnitStructure } from '../QuantityDefinition.js';
import { UnitTokenManager } from '../UnitTokenManager.js';
import { LruCache } from '../utils/LruCache.js';
import { normalizePowers, scalePowers, checkedExponent, UNITY } from '../operations/unit-powers.js';
import { combineUnitExpressions, resolveUnitExpression, type QuantityExpression } from './unit-expression.js';
import { scalarToken, scalarOperation, scalarPower, ONE } from './scalar-expression.js';
import { ExpressionIssue } from './QuantityParseError.js';

const tm = UnitTokenManager.instance;
const prefixAliases = Object.keys(tm.getMap('prefix')).sort((a, b) => b.length - a.length);
const unitDefinitions = new LruCache<string, UnitStructure>();

export function numberExpression(token: Token): QuantityExpression
{
	return {
		scalar: scalarToken(token),
		units: { numerator: UNITY, denominator: UNITY },
		signOffset: /^[+-]/.test(token.text) ? token.offset : undefined
	};
}

export function unitExpression(token: Token): QuantityExpression
{
	let units = unitDefinitions.get(token.value);

	if (!units)
	{
		let unit = tm.getUnitToken(token.value), prefix: string | null | undefined;

		if (!unit)
		{
			for (const alias of prefixAliases)
			{
				if (!token.value.startsWith(alias))
				{
					continue;
				}

				unit = tm.getUnitToken(token.value.slice(alias.length));

				if (unit)
				{
					prefix = tm.getPrefixToken(alias); break;
				}
			}
		}

		if (!unit)
		{
			throw new ExpressionIssue('UNKNOWN_UNIT', token.offset, `Unknown unit ${JSON.stringify(token.value)}`);
		}

		units = { numerator: normalizePowers([{ unit, ...(prefix ? { prefix } : {}), exponent: 1 }]), denominator: UNITY };
		unitDefinitions.set(token.value, units);
	}

	return {
		scalar: ONE,
		units,
		hasUnits: true
	};
}

export function product(left: QuantityExpression, right: QuantityExpression, divide = false, offset = 0): QuantityExpression
{
	return {
		scalar: scalarOperation(divide ? 'divide' : 'multiply', left.scalar, right.scalar, offset),
		units: combineUnitExpressions(left.units, right.units, divide),
		hasUnits: left.hasUnits || right.hasUnits,
		signOffset: left.signOffset,
	};
}

/** Bare signs after whitespace look like addition/subtraction; require an operator. */
export function implicitProduct(left: QuantityExpression, right: QuantityExpression): QuantityExpression
{
	if (right.signOffset !== undefined)
	{
		throw new ExpressionIssue('UNEXPECTED_TOKEN', right.signOffset, 'Use explicit multiplication before a signed factor; addition and subtraction are not supported');
	}

	return product(left, right);
}

export function group(expression: QuantityExpression): QuantityExpression
{
	return { ...expression, signOffset: undefined };
}

/** A group sign applies after its power: -(2)^2 = -4, while (-2)^2 = 4. */
export function signedGroup(sign: Token, expression: QuantityExpression): QuantityExpression
{
	return { ...expression, signOffset: sign.offset, scalar: sign.value === '-'
		? { kind: 'negate', base: expression.scalar, offset: sign.offset } : expression.scalar };
}

export function reciprocal(expression: QuantityExpression, offset: number): QuantityExpression
{
	return product({ scalar: ONE, units: { numerator: UNITY, denominator: UNITY } }, expression, true, offset);
}

export function power(expression: QuantityExpression, exponent: Token, units: boolean): QuantityExpression
{
	let result = expression.units;

	if (units && expression.hasUnits)
	{
		try
		{
			if (exponent.type !== 'integer' && exponent.type !== 'superscript')
			{
				throw new Error('Unit exponent must use safe integer syntax');
			}

			const n = checkedExponent(Number(exponent.value));
			// Resolve and validate intermediate sums even when the outer power is zero.
			const resolved = resolveUnitExpression(expression.units);

			result = {
				numerator: scalePowers(n < 0 ? resolved.denominator : resolved.numerator, Math.abs(n)),
				denominator: scalePowers(n < 0 ? resolved.numerator : resolved.denominator, Math.abs(n)),
			};
		}
		catch (error)
		{
			throw new ExpressionIssue('INVALID_EXPONENT', exponent.offset, (error as Error).message);
		}
	}

	return {
		...expression,
		scalar: units && expression.hasUnits && expression.scalar === ONE ? ONE : scalarPower(expression.scalar, exponent),
		units: result
	};
}
