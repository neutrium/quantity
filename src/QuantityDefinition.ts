import { Decimal } from "@neutrium/decimal";

export interface QuantityDefinition
{
	scalar: Decimal,		// The numerical value of the quantity
	numerator: string[]		// The units numerator - An array of unit tokens
	denominator: string[]	// The units denominator - An array of unit tokens
}