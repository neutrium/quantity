import { Decimal } from '@neutrium/math';
export interface IQuantityDefinition {
    scalar: Decimal;
    numerator?: string[];
    denominator?: string[];
}
export declare function isQuantityDefinition(value: any): value is IQuantityDefinition;
