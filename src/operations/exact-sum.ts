import { Decimal } from '@neutrium/decimal';
import { calculationDecimal, type DecimalConstructor } from './numeric-context.js';

/** A finite rational coefficient and a separate decimal exponent; gaps never expand. */
export interface RationalTerm
{
	readonly numerator: bigint;
	readonly denominator: bigint;
	readonly exponent: bigint;
}

/** Exact when small; otherwise refine directed bounds without expanding counted powers. */
export type RationalValue = { readonly exact: RationalTerm }
	| { bounds(precision: number): readonly [RationalTerm, RationalTerm] };

interface Term
{
	coefficient: bigint;
	exponent: bigint;
}

const Exact = Decimal.clone({
	maxOutputDigits: Decimal.limits.maxDigits,
	minE: -Decimal.limits.maxExponent,
	maxE: Decimal.limits.maxExponent
});

export function decimalTerm(value: Decimal | string): RationalTerm
{
	const text = new Exact(value).toExponential();
	const [mantissa, exponent] = text.split('e');
	const digits = mantissa.replace('-', '').replace('.', '');

	return {
		numerator: BigInt(mantissa.startsWith('-') ? '-' + digits : digits),
		denominator: 1n,
		exponent: BigInt(exponent) - BigInt(digits.length - 1)
	};
}

export function scaleTerm(term: RationalTerm, numerator: bigint, denominator = 1n): RationalTerm
{
	const sign = denominator < 0n ? -1n : 1n;

	return {
		numerator: term.numerator * numerator * sign,
		denominator: term.denominator * denominator * sign,
		exponent: term.exponent
	};
}

export function negateValue(value: RationalValue): RationalValue
{
	if ('exact' in value)
	{
		return { exact: scaleTerm(value.exact, -1n) };
	}

	return {
		bounds(precision)
		{
			const [lower, upper] = value.bounds(precision);
			return [scaleTerm(upper, -1n), scaleTerm(lower, -1n)];
		}
	};
}

/**
 * Evaluate a monotone function of rational operands. All arguments must move in
 * the same direction (negate subtrahends first). Accept an enclosure only when
 * both ends give the same final result, including its zero sign or boundary error.
 */
export function evaluateRational<T extends Decimal | number | string>(values: readonly RationalValue[], evaluate: (terms: RationalTerm[]) => T): T
{
	if (values.every(value => 'exact' in value))
	{
		return evaluate(values.map(value => value.exact));
	}

	for (let precision = 64;; precision = Math.min(precision * 2, Decimal.limits.maxDigits))
	{
		const bounds = values.map(value => 'exact' in value ? [value.exact, value.exact] : value.bounds(precision));
		const low = evaluate(bounds.map(pair => pair[0])), high = evaluate(bounds.map(pair => pair[1]));

		if (low === high || low instanceof Decimal && high instanceof Decimal && low.eq(high) && low.isNeg() === high.isNeg())
		{
			return low;
		}

		if (precision === Decimal.limits.maxDigits)
		{
			throw new RangeError('Calculation exceeds Decimal precision limit');
		}
	}
}

function digits(value: bigint): bigint {
	return BigInt((value < 0n ? -value : value).toString().length);
}

function order(term: Term): bigint
{
	return term.exponent + digits(term.coefficient);
}

function gcd(a: bigint, b: bigint): bigint
{
	while (b)
	{
		[a, b] = [b, a % b];
	}

	return a;
}

/** Merge overlapping coefficients, cancel first, and retain distant tails separately. */
function compact(input: readonly Term[]): Term[]
{
	const terms = input.filter(term => term.coefficient !== 0n).map(term => ({ ...term }));
	// Separated terms cannot collectively outweigh a leading coefficient.
	const gap = BigInt(String(terms.length + 1).length + 1);

	for (;;)
	{
		terms.sort((a, b) => order(a) > order(b) ? -1 : order(a) < order(b) ? 1 : 0);
		let merged = false;

		for (let i = 0; i + 1 < terms.length; i++)
		{
			const a = terms[i], b = terms[i + 1];

			if (order(b) < a.exponent - gap)
			{
				continue;
			}

			const exponent = a.exponent < b.exponent ? a.exponent : b.exponent;
			const coefficient = a.coefficient * 10n ** (a.exponent - exponent)
				+ b.coefficient * 10n ** (b.exponent - exponent);
			terms.splice(i, 2, ...(coefficient ? [{ coefficient, exponent }] : []));
			merged = true;
			break;
		}

		if (!merged)
		{
			return terms;
		}
	}
}

function sign(terms: readonly Term[]): number
{
	const first = compact(terms)[0];

	return first ? first.coefficient < 0n ? -1 : 1 : 0;
}

function commonTerms(input: readonly RationalTerm[]): { terms: Term[]; denominator: bigint }
{
	let denominator = 1n;

	for (const term of input)
	{
		denominator = denominator / gcd(denominator, term.denominator) * term.denominator;
	}

	return {
		denominator,
		terms: compact(input.map(term => ({
			coefficient: term.numerator * (denominator / term.denominator),
			exponent: term.exponent,
		})))
	};
}

export function compareSum(input: readonly RationalTerm[]): number
{
	return sign(commonTerms(input).terms);
}

/** Round the complete rational sum once, including the sign of arbitrarily distant tails. */
export function roundSum(input: readonly RationalTerm[], Output: DecimalConstructor): Decimal
{
	const { terms, denominator } = commonTerms(input);

	if (!terms.length)
	{
		return new Output(1).sub(1);
	}

	if (terms.length === 1)
	{
		const term = terms[0];
		const numeratorText = term.coefficient.toString(), denominatorText = denominator.toString();
		// Decimal division stops at an exact quotient instead of padding it to
		// the configured precision. Only use it after all cancellation is done.
		// Oversized intermediate integers still use the BigInt path below.
		if (numeratorText.length - Number(term.coefficient < 0n) <= Decimal.limits.maxDigits &&
			denominatorText.length <= Decimal.limits.maxDigits)
		{
			const Numeric = calculationDecimal(Output);
			const rounded = new Numeric(numeratorText).div(denominatorText);
			const [coefficient, exponent] = rounded.toExponential().split('e');
			// Keep the scientific scale external until after rounding; it can
			// bring a result back inside the output's exponent limits.
			return new Output(`${coefficient}e${term.exponent + BigInt(exponent)}`);
		}
	}

	const negative = terms[0].coefficient < 0n;

	if (negative)
	{
		for (const term of terms)
		{
			term.coefficient = -term.coefficient;
		}
	}

	let exponent = order(terms[0]) - digits(denominator);
	const comparePower = (power: bigint) => sign([...terms, { coefficient: -denominator, exponent: power }]);

	while (comparePower(exponent) < 0) exponent--;
	while (comparePower(exponent + 1n) >= 0) exponent++;

	const place = exponent - BigInt(Output.config.precision - 1);
	let integer = 0n;
	const fraction: Term[] = [];

	for (const term of terms)
	{
		const shift = term.exponent - place;

		if (shift >= 0n)
		{
			integer += term.coefficient * 10n ** shift;
		}
		else if (-shift >= digits(term.coefficient))
		{
			fraction.push({ ...term, exponent: shift });
		}
		else
		{
			const divisor = 10n ** -shift;
			integer += term.coefficient / divisor;
			fraction.push({ coefficient: term.coefficient % divisor, exponent: shift });
		}
	}
	let quotient = integer / denominator;
	let remainder = integer % denominator;
	const residualSign = (offset = 0n) => sign([...fraction, { coefficient: remainder + offset, exponent: 0n }]);

	while (residualSign() < 0) { quotient--; remainder += denominator; }
	while (residualSign(-denominator) >= 0) { quotient++; remainder -= denominator; }

	const nonzero = residualSign() !== 0;
	const mode = Output.config.rounding;
	let increment = nonzero && (mode === 'up' || (negative ? mode === 'floor' : mode === 'ceil'));

	if (mode.startsWith('half-'))
	{
		const halfway = sign([...fraction.map(term => ({ ...term, coefficient: term.coefficient * 2n })),
			{ coefficient: remainder * 2n - denominator, exponent: 0n }]);
		increment = halfway > 0 || halfway === 0 && (mode === 'half-up'
			|| mode === 'half-even' && quotient % 2n !== 0n
			|| mode === 'half-floor' && negative || mode === 'half-ceil' && !negative);
	}

	if (increment)
	{
		quotient++;
	}

	return new Output(`${negative ? '-' : ''}${quotient}e${place}`);
}
