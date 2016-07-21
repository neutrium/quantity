export interface IQuantityDefinition {
    scalar: decimal.Decimal;
    numerator?: string[];
    denominator?: string[];
}
export declare function isQuantityDefinition(value: any): value is IQuantityDefinition;
