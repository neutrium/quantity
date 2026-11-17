import { BudgetCache, WeakCacheRegistry } from '@neutrium/utilities/cache';
import { unitPlanBytes, copyCacheText, exponentBytes } from '../utils/cache-memory.js';
import { temperatureChecks, type ParsedTemperatureChecks } from '../operations/temperature-units.js';
import type { QuantityDefinition, UnitStructure } from '../QuantityDefinition.js';
import { compileScalar, evaluateScalar, type ScalarProgram } from './scalar-expression.js';
import { parserScope, type ParserConfig } from './ParserConfig.js';
import type { ArithmeticAdapter } from '@neutrium/math/numeric/arithmetic';
import type { CacheScope } from '../utils/CacheScope.js';
import { lexerTemplate } from './MooQtyLexer.js';
import { PreparedExpression } from './PreparedExpression.js';
import { resolveUnitExpression, type QuantityExpression } from './unit-expression.js';
import { QuantityParseError } from './QuantityParseError.js';
import { parsingError } from './expression-diagnostics.js';
import type { ExpressionEngine } from './ExpressionParser.js';

type ExpressionPlan = UnitStructure & { scalar: ScalarProgram; temperatureError?: string };

function createCache(config: ParserConfig): BudgetCache<ExpressionPlan>
{
	return new BudgetCache(config.cache, {
		detachKey: copyCacheText,
		measure: plan => {
			let bytes = unitPlanBytes(plan.numerator) + unitPlanBytes(plan.denominator) + 64;

			for (const instruction of plan.scalar)
			{
				bytes += 96 + ('text' in instruction && instruction.text !== undefined ? 40 + 2 * instruction.text.length : 0);

				if (instruction.kind === 'power')
				{
					bytes += 2 * instruction.error.length;
				}

				if (instruction.kind === 'rationalPower')
				{
					bytes += exponentBytes(instruction.exponent);
				}
			}

			return bytes;
		},
		detach: plan => ({
			...plan,
			scalar: plan.scalar.map(instruction => 'text' in instruction && instruction.text !== undefined ? { ...instruction, text: copyCacheText(instruction.text) } : instruction)
		}),
	});
}

/** Each grammar owns its plan caches. Token streams and scalar evaluation are local to a call. */
export function createExpressionEngine(read: (prepared: PreparedExpression, input: string) => QuantityExpression): ExpressionEngine
{
	const caches = new WeakCacheRegistry(createCache);

	function parse<T>(input: string, numeric: ArithmeticAdapter<T>, config: ParserConfig, scope?: CacheScope, suppliedScalar?: T)
	{
		if (typeof input !== 'string')
		{
			throw new QuantityParseError('INVALID_INPUT', '', 0, 'Expected a string');
		}

		let prepared: PreparedExpression | undefined;

		try
		{
			// The receiver can disable parser caches. Otherwise the parser's own limits apply.
			const parsingScope = scope && !scope.enabled('parser') ? scope : parserScope(config);
			const plans = parsingScope.enabled('parser') ? caches.get(config) : undefined;
			let key: string;

			// A leading letter gives a bare cache key and source offset zero without lexing.
			if (plans && /^[A-Za-z]/.test(input))
			{
				key = PreparedExpression.bareKey(input);
			}
			else
			{
				prepared = new PreparedExpression(lexerTemplate.clone(), input, parsingScope);
				key = plans ? prepared.cacheKey(input) : '';
			}

			const cached = plans?.get(key);
			let plan = cached;

			if (!plan)
			{
				prepared ??= new PreparedExpression(lexerTemplate.clone(), input, parsingScope);
				const expression = read(prepared, input);
				const { numerator, denominator } = resolveUnitExpression(expression.units);
				plan = { scalar: compileScalar(expression.scalar), numerator, denominator, temperatureError: expression.temperatureError };
			}

			const result: QuantityDefinition<T | undefined> & ParsedTemperatureChecks<T> = { numerator: plan.numerator, denominator: plan.denominator, scalar: suppliedScalar };

			if (plan.temperatureError)
			{
				result[temperatureChecks] = plan.temperatureError;
			}

			if (suppliedScalar === undefined)
			{
				result.scalar = evaluateScalar(plan.scalar, prepared?.scalar ?? '1', numeric, result, scope ?? parsingScope);
			}

			if (!cached)
			{
				plans?.set(key, plan);
			}

			return result as QuantityDefinition<T>;
		}
		catch (error)
		{
			throw parsingError(error, input, prepared);
		}
	}

	return { peekCache: config => caches.peek(config), parse };
}
