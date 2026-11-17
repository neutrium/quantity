import type { ArithmeticAdapter } from '@neutrium/math/numeric/arithmetic';

/** Shared methods are only candidates: the receiver must recognize the actual operand's encoding. */
export function acceptsNumericOperand(receiver: ArithmeticAdapter<unknown>, source: ArithmeticAdapter<unknown>, scalar: unknown): boolean
{
	// Quantities already validate their own scalars, and adapters/scalars are immutable.
	return receiver === source || receiver.from === source.from && receiver.isValue === source.isValue
		&& receiver.isValue(scalar);
}

const emptyConfig = Object.freeze({});

/** Numeric configuration inferred from an adapter, or an empty fixed-precision configuration. */
export type NumericSettings<A> = A extends {
	/** Immutable numeric settings exposed by a configurable adapter. */
	readonly config: infer C extends object;
} ? C : Readonly<Record<never, never>>;

/** Fixed-precision adapters need no configuration object. */
export function numericSettings<A>(numeric: A): NumericSettings<A>
{
	return (numeric && typeof numeric === 'object' && 'config' in numeric ? numeric.config : emptyConfig) as NumericSettings<A>;
}
