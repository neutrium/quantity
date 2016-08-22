import {Decimal} from '@neutrium/math';

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