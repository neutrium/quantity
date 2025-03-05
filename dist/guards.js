import { Quantity } from './Quantity.js';
export function isQuantityDefinition(value) {
    return value.scalar !== undefined;
}
export const isQuantity = (x) => x instanceof Quantity;
