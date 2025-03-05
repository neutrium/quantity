import { Decimal } from "@neutrium/math";
export interface QuantityDefinition {
    scalar: Decimal;
    numerator: string[];
    denominator: string[];
}
