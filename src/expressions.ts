import {
	createDomainExpressionFactory, ExpressionError,
	type ExpressionDomain, type ExpressionFactory, type ExpressionOptions, type ExpressionFunction, type DomainExpressionFunction, type ExpressionNode,
} from '@neutrium/math/expressions/core';
import { Quantity as QuantityBase, type QuantityInput } from './QuantityCore.js';
import { PrattParser, QuantityParseError } from './parsers/PrattParser.js';
import { copyDataRecord, assertKnownKeys } from '@neutrium/utilities/validation';
import { quantitySyntax } from './expressions/syntax.js';

export { ExpressionError } from '@neutrium/math/expressions/core';
export type { ExpressionFactory, CompiledExpression, ExpressionResult, ExpressionNode, ExpressionLimits } from '@neutrium/math/expressions/core';

/** Configuration for a calculator bound to a Quantity class and its numeric context. */
export interface QuantityEvaluatorOptions<T, Numeric extends object = object> extends ExpressionOptions<QuantityBase<T, Numeric>>
{
	/** Preset or configured class used for every value and operation. */
	readonly Quantity: {
		/** Construct a value with an optional unit-literal parser override. */
		new (input: QuantityInput<T>, units?: string, parser?: PrattParser): QuantityBase<T, Numeric>;
	};
}

/**
 * Compile and evaluate mathematical expressions with units, variables and functions.
 * Values use the supplied Quantity class. Unit names are reserved in source; bindings
 * supply other identifiers. Adjacent scalar/unit pairs are literals, including unit powers.
 * @example
 * ```ts
 * import { Quantity } from '@neutrium/quantity';
 * import { createQuantityEvaluator } from '@neutrium/quantity/expressions';
 * const evaluator = createQuantityEvaluator({ Quantity });
 * evaluator.evaluate('2 m/s * 1 kg + 4 kg.m/s').to('kg*m/s').scalar.toString(); // "6"
 * evaluator.compile('mass * velocity').evaluate({
 *     mass: new Quantity('1 kg'), velocity: new Quantity('2 m/s'),
 * });
 * ```
 */
export function createQuantityEvaluator<T, Numeric extends object = object>(options: QuantityEvaluatorOptions<T, Numeric>): ExpressionFactory<QuantityBase<T, Numeric>>
{
	let snapshot: QuantityEvaluatorOptions<T, Numeric>;

	try
	{
		snapshot = copyDataRecord(options, 'quantity evaluator') as unknown as QuantityEvaluatorOptions<T, Numeric>;
		assertKnownKeys(snapshot, ['Quantity', 'limits', 'constants', 'functions'], 'quantity evaluator');
	}
	catch (cause)
	{
		throw new ExpressionError('INVALID_OPTIONS', cause instanceof Error ? cause.message : 'Invalid evaluator options', 0, 0, cause);
	}

	const { Quantity: Q, ...settings } = snapshot;
	const syntax = quantitySyntax();

	if (settings.constants !== undefined)
	{
		let constants: Record<string, unknown>;

		try
		{
			constants = copyDataRecord(settings.constants, 'constants');
		}
		catch (cause)
		{
			throw new ExpressionError('INVALID_OPTIONS', 'Constants must be data properties', 0, 0, cause);
		}

		for (const name of Object.keys(constants))
		{
			if (syntax.readLiteral!(name, 0, true)?.end === name.length)
			{
				throw new ExpressionError('INVALID_OPTIONS', `Unit name ${name} cannot be used as a constant`);
			}
		}
	}

	if (typeof Q !== 'function')
	{
		throw new ExpressionError('INVALID_OPTIONS', 'A Quantity constructor is required');
	}

	const probe = new Q(0);

	if (!(probe instanceof QuantityBase))
	{
		throw new ExpressionError('INVALID_OPTIONS', 'Expected a Quantity class');
	}

	const numeric = probe.numeric;
	const parser = new PrattParser();
	type Value = QuantityBase<T, Numeric>;
	const fail = (message: string): never => { throw new ExpressionError('DOMAIN_ERROR', message); };

	function scalar(value: Value): T
	{
		if (!value.isCompatible(probe))
		{
			return fail('Expected a dimensionless quantity');
		}

		return value.to('').scalar;
	}

	function nonzero(value: Value): void
	{
		if (numeric.compare(value.scalar, numeric.from(0)) === 0)
		{
			throw new ExpressionError('DIVISION_BY_ZERO', 'Cannot divide by zero');
		}
	}

	function negate(value: Value): Value
	{
		if (value.isTemperature())
		{
			return fail('Negating an absolute temperature requires a signed temperature literal');
		}

		return value.mul(-1);
	}

	function calculate(action: () => Value): Value
	{
		try
		{
			return action();
		}
		catch (cause)
		{
			if (cause instanceof ExpressionError)
			{
				throw cause;
			}

			throw new ExpressionError('DOMAIN_ERROR', cause instanceof Error ? cause.message : 'Invalid quantity operation', 0, 0, cause);
		}
	}

	const fixed = (count: number, evaluate: (args: readonly Value[]) => Value): ExpressionFunction<Value> => ({ minArgs: count, evaluate });

	const functions: Record<string, DomainExpressionFunction<Value>> = {
		sqrt: fixed(1, ([value]) => calculate(() => value.sqrt())),
		cbrt: fixed(1, ([value]) => calculate(() => value.cbrt())),
		abs: fixed(1, ([value]) => {
			if (value.isTemperature()) return fail('abs requires an interval or an ordinary quantity');
			return numeric.compare(value.scalar, numeric.from(0)) < 0 ? negate(value) : value;
		}),
		pow: { ...fixed(2, ([base, exponent]) => calculate(() => base.pow(scalar(exponent)))), literalPower: true },
	};

	for (const name of ['min', 'max'] as const)
	{
		functions[name] = { minArgs: 1, maxArgs: Number.MAX_SAFE_INTEGER, evaluate: args => calculate(() => {
			let result = args[0];

			for (const value of args.slice(1))
			{
				if (!result.isCompatible(value) || result.isTemperature() !== value.isTemperature()) fail('Expected comparable quantities');
				if (name === 'min' ? value.lt(result) : value.gt(result)) result = value;
			}

			return result;
		}) };
	}
	const domain: ExpressionDomain<Value> = {
		literal: (text, _span, kind) => {
			try
			{
				return kind === 'quantity' ? new Q(text, undefined, parser) : new Q(numeric.from(text));
			}
			catch (cause)
			{
				throw new ExpressionError(cause instanceof QuantityParseError && cause.code === 'INVALID_EXPONENT' ? 'INVALID_EXPONENT' : 'INVALID_LITERAL',
					cause instanceof Error ? cause.message : 'Invalid quantity literal', 0, 0, cause);
			}
		},
		from: value => {
			if (value instanceof QuantityBase)
			{
				return new Q(value);
			}

			if (typeof value === 'number' || typeof value === 'bigint' || numeric.isValue(value)
				|| typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))
			{
				return new Q(numeric.from(value));
			}

			return fail('Bindings must be quantities or numeric scalars; construct a Quantity for unit-bearing text');
		},
		validate: value => {
			if (!(value instanceof QuantityBase) || value.numeric !== numeric)
			{
				return fail('Expected a quantity in the evaluator numeric context');
			}

			if (!numeric.isFinite(value.scalar))
			{
				throw new ExpressionError('NON_FINITE_RESULT', 'Expression value is not finite');
			}

			return value as Value;
		},
		unary: (operator, value) => operator === '+' ? value : negate(value),
		binary: (operator, left, right) => calculate(() => {
			switch (operator)
			{
				case '+': return left.add(right);
				case '-': return left.sub(right);
				case '*': return left.mul(right);
				case '/': nonzero(right); return left.div(right);
				case '^': return left.pow(scalar(right));
				case '%': {
					if (left.isTemperature() || right.isTemperature() || !left.isCompatible(right))
					{
						return fail('Remainder requires compatible non-temperature quantities');
					}

					const converted = right.to(left);
					nonzero(converted);

					return new Q({ scalar: numeric.rem(left.scalar, converted.scalar), numerator: left.numerator, denominator: left.denominator });
				}
			}
		}),
		literalPower: (base, exponent) => calculate(() => base.pow(exponent)),
		exponentLiteral: exactExponent,
		functions,
	};

	return createDomainExpressionFactory(domain, { ...settings, syntax });
}

/** Exact integer ratios in powers must not first round through the numeric backend. */
function exactExponent(node: ExpressionNode): string | undefined
{
	let negative = false;

	while (node.kind === 'group' || node.kind === 'unary')
	{
		if (node.kind === 'unary')
		{
			negative = negative !== (node.operator === '-'); node = node.operand;
		}
		else
		{
			node = node.expression;
		}
	}

	if (node.kind === 'literal' && node.literalType === undefined)
	{
		return (negative ? '-' : '') + node.text;
	}

	if (node.kind !== 'binary' || node.operator !== '/')
	{
		return undefined;
	}

	function integer(part: ExpressionNode): string | undefined
	{
		let negative = false;

		while (part.kind === 'group' || part.kind === 'unary')
		{
			if (part.kind === 'unary')
			{
				negative = negative !== (part.operator === '-'); part = part.operand;
			}
			else
			{
				part = part.expression;
			}
		}

		return part.kind === 'literal' && part.literalType === undefined && /^\d+$/.test(part.text)
			? (negative ? '-' : '') + part.text : undefined;
	}

	const numerator = integer(node.left), denominator = integer(node.right);

	if (numerator === undefined || denominator === undefined)
	{
		return undefined;
	}

	const value = BigInt(numerator);

	return (negative ? -value : value).toString() + '/' + denominator;
}
