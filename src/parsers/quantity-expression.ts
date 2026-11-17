import { parseExponent } from '../operations/exponents.js';
import { CacheScope, defaultCacheScope } from '../utils/CacheScope.js';
import { BudgetCache } from '@neutrium/utilities/cache';
import { unitPlanBytes, copyCacheText } from '../utils/cache-memory.js';
import type { Token } from 'moo';
import type { UnitStructure } from '../QuantityDefinition.js';
import { UnitTokenManager } from '../UnitTokenManager.js';
import { completeNormalizedUnits, normalizePowers, powerUnitSides, UNITY } from '../operations/unit-powers.js';
import { combineUnitExpressions, resolveUnitExpression, type QuantityExpression } from './unit-expression.js';
import { scalarToken, scalarOperation, scalarPower, ONE } from './scalar-expression.js';
import { ExpressionIssue } from './QuantityParseError.js';

const tm = UnitTokenManager.instance;
const prefixAliases = Object.keys(tm.getMap('prefix')).sort((a, b) => b.length - a.length);
const unitDefinitionsKey = Symbol();

export function numberExpression(token: Token): QuantityExpression
{
	return {
		scalar: scalarToken(token),
		units: { numerator: UNITY, denominator: UNITY, offset: token.offset },
		offset: token.offset,
		signed: /^[+-]/.test(token.text),
	};
}

export function unitExpression(token: Token & { cacheScope?: CacheScope }): QuantityExpression
{
	const scope = token.cacheScope ?? defaultCacheScope;
	const unitDefinitions = scope.get('parser', unitDefinitionsKey, () => new BudgetCache<UnitStructure>(
		scope.config.parser,
		{
			detachKey: copyCacheText,
			measure: units => unitPlanBytes(units.numerator) + unitPlanBytes(units.denominator)
		}
	));
	let units = unitDefinitions?.get(token.value);

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
		unitDefinitions?.set(token.value, units);
	}

	const record = units.numerator[0];
	const absoluteUnit = record?.unit.startsWith('<temp-') ? record.unit : undefined;

	return {
		absoluteUnit,
		bareTemperature: !!absoluteUnit,
		temperatureError: absoluteUnit && record.prefix ? 'Cannot multiply by temperatures' : undefined,
		scalar: ONE,
		units: { ...units, offset: token.offset },
		offset: token.offset,
		hasUnits: true
	};
}

/** Preserve the reading consumed by an operation for validation by the receiving Quantity. */
function checkedReading(expression: QuantityExpression, offset: number): QuantityExpression['scalar']
{
	const base = expression.scalar;
	return expression.absoluteUnit && base !== ONE && base.kind !== 'temperatureReading'
		? { kind: 'temperatureReading', unit: expression.absoluteUnit, base, offset }
		: base;
}

function hasUnitRecords({ units }: QuantityExpression): boolean
{
	// A product node is only created when nonempty sides need merging.
	return !('numerator' in units) || units.numerator.length !== 0 || units.denominator.length !== 0;
}

export function product(left: QuantityExpression, right: QuantityExpression, divide: boolean, offset: number, implicit = false): QuantityExpression
{
	let temperatureError = left.temperatureError ?? right.temperatureError;

	if (!temperatureError && (right.absoluteUnit && divide ||
		left.absoluteUnit && hasUnitRecords(right) || right.absoluteUnit && hasUnitRecords(left)))
	{
		temperatureError = divide ? 'Cannot divide with temperatures' : 'Cannot multiply by temperatures';
	}

	const absoluteUnit = left.absoluteUnit ?? right.absoluteUnit;
	let scalar: QuantityExpression['scalar'];

	if (absoluteUnit && !temperatureError && !(implicit && right.bareTemperature && !left.hasUnits))
	{
		// Keep evaluation order, even when the temperature is the right operand.
		scalar = { kind: 'temperatureScale', unit: absoluteUnit, divide, temperatureOnRight: !left.absoluteUnit,
			left: checkedReading(left, offset), right: checkedReading(right, offset), offset };
	}
	else if (divide && left.beforeReciprocalUnit && right.hasUnits && right.scalar === ONE)
	{
		// In "2.345 1/s" the 1 belongs to the unit expression returned by units().
		scalar = left.beforeReciprocalUnit;
	}
	else
	{
		// Juxtaposing a scalar and a bare unit constructs the reading without rounding it.
		scalar = scalarOperation(divide ? 'divide' : 'multiply', left.scalar, right.scalar, offset);
	}

	return {
		scalar,
		units: combineUnitExpressions(left.units, right.units, divide),
		hasUnits: left.hasUnits || right.hasUnits,
		offset: left.offset,
		signed: left.signed,
		temperatureError,
		absoluteUnit,
	};
}

/** Bare signs after whitespace look like addition/subtraction; require an operator. */
export function implicitProduct(left: QuantityExpression, right: QuantityExpression): QuantityExpression
{
	if (right.signed)
	{
		throw new ExpressionIssue('UNEXPECTED_TOKEN', right.offset, 'Use explicit multiplication before a signed factor; addition and subtraction are not supported');
	}

	const result = product(left, right, false, right.offset, true);

	if (!right.hasUnits && right.scalar.kind === 'literal' && right.scalar.text === '1' && right.offset === right.scalar.offset)
	{
		result.beforeReciprocalUnit = left.scalar;
	}

	return result;
}

export function group(expression: QuantityExpression, offset: number): QuantityExpression
{
	return { ...expression, offset, signed: false, bareTemperature: false, beforeReciprocalUnit: undefined };
}

/** A group sign applies after its power: -(2)^2 = -4, while (-2)^2 = 4. */
export function signedGroup(sign: Token, expression: QuantityExpression): QuantityExpression
{
	return {
		...expression,
		offset: sign.offset,
		signed: true,
		scalar: sign.value === '-' ? { kind: 'negate', base: checkedReading(expression, sign.offset), unit: expression.absoluteUnit, offset: sign.offset } : expression.scalar
	};
}

export function reciprocal(expression: QuantityExpression, offset: number): QuantityExpression
{
	return product({ scalar: ONE, units: { numerator: UNITY, denominator: UNITY, offset }, offset }, expression, true, offset);
}

export function power(expression: QuantityExpression, exponent: Token, units: boolean): QuantityExpression
{
	const offset = exponent.offset;

	if (!units || !expression.hasUnits)
	{
		// The plan retains the exponent, while each evaluation uses its own adapter.
		const text = exponent.value.startsWith('+') ? exponent.value.slice(1) : exponent.value;

		return {
			...expression,
			scalar: scalarPower(expression.scalar, text, offset)
		};
	}

	try
	{
		const n = parseExponent(exponent.value);
		// Resolve and validate intermediate sums even when the outer power is zero.
		const resolved = resolveUnitExpression(expression.units);
		const absolute = expression.absoluteUnit;
		const temperatureError = expression.temperatureError
			?? (absolute && n !== 0 && n !== 1 ? 'Cannot raise absolute temperatures to powers' : undefined);
		const base = absolute && (n === 0 || n === 1) ? checkedReading(expression, offset) : expression.scalar;

		if (n === 1 && absolute)
		{
			return { ...expression, scalar: base };
		}

		const [numerator, denominator] = powerUnitSides(resolved, n);
		const powered = completeNormalizedUnits({
			numerator, denominator,
			base: expression.units,
			exponent: n,
		});

		return {
			...expression,
			absoluteUnit: undefined,
			temperatureError,
			scalar: base === ONE ? ONE : { kind: 'rationalPower', base, exponent: n, offset },
			units: powered,
		};
	}
	catch (error)
	{
		if (error instanceof ExpressionIssue)
		{
			throw error;
		}

		throw new ExpressionIssue('INVALID_EXPONENT', offset, (error as Error).message);
	}
}
