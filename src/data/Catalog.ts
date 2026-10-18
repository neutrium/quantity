import type { ScaleFactor } from './ScaleFactor.js';
import type { UnitStructure } from '../QuantityDefinition.js';

/** Each definition has a preferred output alias followed by alternative spellings. */
export type CatalogEntry = [aliases: [string, ...string[]], scalar: ScaleFactor];

export interface UnitCategory
{
	numerator?: string[];
	denominator?: string[];
	units: Record<string, CatalogEntry>;
}

/** Resolved catalog data with shared counted dimensions; empty sides represent unity. */
export interface UnitDefinition extends UnitStructure
{
	scalar: ScaleFactor;
	category: string;
}
