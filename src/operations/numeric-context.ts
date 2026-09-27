import { Decimal, type DecimalConfigInput } from '@neutrium/decimal';

/** Decimal constructor supplied to a parser for context-aware scalar evaluation. */
export type DecimalConstructor = ReturnType<typeof Decimal.clone>;
const calculationContexts = new WeakMap<object, DecimalConstructor>();

/** Keep output precision and rounding while preserving operands outside its exponent range. */
export function calculationDecimal(Output: DecimalConstructor): DecimalConstructor
{
	const config = Output.config;
	let Numeric = calculationContexts.get(config);

	if (!Numeric)
	{
		Numeric = Output.clone({
			maxOutputDigits: Decimal.limits.maxDigits,
			minE: -Decimal.limits.maxExponent,
			maxE: Decimal.limits.maxExponent
		});

		calculationContexts.set(config, Numeric);
	}

	return Numeric;
}

/** Calculate with stored operands unchanged, enforcing the receiver's settings on the result. */
export function calculateScalar(value: Decimal, operation: 'add' | 'sub' | 'mul' | 'div' | 'pow',
	operand: number | Decimal, Output: DecimalConstructor): Decimal
{
	// Decimal methods read current settings and preserve their existing receiver value.
	if (value.constructor === Output)
	{
		return value[operation](operand);
	}

	const Numeric = calculationDecimal(Output);

	return new Output(new Numeric(value)[operation](operand));
}

/** Snapshot settings and prevent later mutation through scalar.constructor.config. */
export function isolatedDecimal(source: DecimalConstructor, config: DecimalConfigInput): DecimalConstructor
{
	const Result = source.clone(config);
	const Parent = Object.getPrototypeOf(Result);

	Object.defineProperty(Result, 'config', {
		get()
		{
			return Reflect.get(Parent, 'config', this);
		},
		set(value: DecimalConfigInput)
		{
			if (this === Result)
			{
				throw new TypeError('Quantity configuration is fixed; use withConfig() to create another class');
			}

			Reflect.set(Parent, 'config', value, this);
		},
		configurable: false,
	});

	return Result;
}
