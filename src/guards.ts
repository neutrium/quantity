import { Decimal } from '@neutrium/decimal'
import { Quantity } from './Quantity.js'
import { QuantityDefinition } from './QuantityDefinition.js';

export type QuantityInitParam = string | number | Decimal | QuantityDefinition | Quantity;

export function isQuantityDefinition(value: any): value is QuantityDefinition
{
	return (<QuantityDefinition>value).scalar !== undefined;
}

export const isQuantity = (x: any): x is Quantity => x instanceof Quantity