import type { UnitExponent, UnitPower } from '../QuantityDefinition.js';

/** Detach retained text from potentially much larger input backing strings. */
export function copyCacheText(text: string): string { return JSON.parse(JSON.stringify(text)); }

/** Additional storage for a fraction record and its two bigint components. */
export function exponentBytes(exponent: UnitExponent): number
{
	return typeof exponent === 'number' ? 0 : 64 + 2 * (exponent.numerator.toString().length + exponent.denominator.toString().length);
}

/** Conservative accounting includes arrays, records and UTF-16 string contents. */
export function unitPlanBytes(terms: readonly UnitPower[]): number
{
	let bytes = 64;
	for (const term of terms)
	{
		bytes += 128 + 2 * (term.unit.length + (term.prefix?.length ?? 0)) + exponentBytes(term.exponent);
	}

	return bytes;
}
