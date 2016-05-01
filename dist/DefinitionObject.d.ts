export interface IQuantityDefinition {
    scalar: number;
    numerator?: string[];
    denominator?: string[];
}
export declare function isQuantityDefinition(value: any): value is IQuantityDefinition;
