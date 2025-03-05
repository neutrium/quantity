import { Decimal } from '@neutrium/math';
import { Quantity } from './Quantity.js';
import { QuantityDefinition } from './QuantityDefinition.js';
export type QuantityInitParam = string | number | Decimal | QuantityDefinition | Quantity;
export declare function isQuantityDefinition(value: any): value is QuantityDefinition;
export declare const isQuantity: (x: any) => x is Quantity;
