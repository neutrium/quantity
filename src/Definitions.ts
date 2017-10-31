import { Decimal } from '@neutrium/math'
import { Quantity } from './Quantity'

export interface IQuantityDefinition
{
    scalar : Decimal;
    numerator ?: string[];
    denominator ?: string[];
}

export function isQuantityDefinition(value: any): value is IQuantityDefinition
{
    return (<IQuantityDefinition>value).scalar !== undefined;
}

export type QuantityInitParam = string | number | Decimal | IQuantityDefinition | Quantity;

export type QuantityInput = string | number | Quantity;