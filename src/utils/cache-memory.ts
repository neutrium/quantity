import type { UnitPower } from '../QuantityDefinition.js';

/** Detach retained text from potentially much larger input backing strings. */
export function copyCacheText(text: string): string { return JSON.parse(JSON.stringify(text)); }

/** Conservative accounting includes arrays, records and UTF-16 string contents. */
export function unitPlanBytes(terms: readonly UnitPower[]): number
{
	let bytes = 64;
	for (const term of terms)
	{
		bytes += 128 + 2 * (term.unit.length + (term.prefix?.length ?? 0));
	}

	return bytes;
}
