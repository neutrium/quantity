import { Decimal } from '@neutrium/math';
import { Quantity } from './Quantity';
export interface IQuantityDefinition {
    scalar: Decimal;
    numerator?: string[];
    denominator?: string[];
}
export declare function isQuantityDefinition(value: any): value is IQuantityDefinition;
export declare type QuantityInitParam = string | number | Decimal | IQuantityDefinition | Quantity;
export declare type QuantityInput = string | number | Quantity;
