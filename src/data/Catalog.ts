import type { ScaleFactor } from './ScaleFactor.js';

/** Each definition has a preferred output alias followed by alternative spellings. */
export type CatalogEntry = [aliases: [string, ...string[]], scalar: ScaleFactor];

export interface UnitCategory
{
	numerator?: string[];
	denominator?: string[];
	units: Record<string, CatalogEntry>;
}

/** Resolved catalog data; prefixes have null dimensions and unit sides may be absent. */
export interface UnitDefinition
{
	scalar: ScaleFactor;
	numerator?: string[] | null;
	denominator?: string[] | null;
	category: string;
}
