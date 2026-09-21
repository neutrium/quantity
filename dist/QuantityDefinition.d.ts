import { Decimal } from "@neutrium/decimal";
export interface QuantityDefinition {
    scalar: Decimal;
    numerator: string[];
    denominator: string[];
}
