export interface IQuantityDefinition
{
    scalar : decimal.Decimal;
    numerator ?: string[];
    denominator ?: string[];
}

export function isQuantityDefinition(value: any): value is IQuantityDefinition
{
    return (<IQuantityDefinition>value).scalar !== undefined;
}