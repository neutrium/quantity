export interface IQuantityDefinition
{
    scalar : number;
    numerator ?: string[];
    denominator ?: string[];
}

export function isQuantityDefinition(value: any): value is IQuantityDefinition
{
    return (<IQuantityDefinition>value).scalar !== undefined;
}