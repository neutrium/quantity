/*!
Copyright © 2006-2007 Kevin C. Olbrich
Copyright © 2010-2013 LIM SAS (http://lim.eu) - Julien Sanchez
Copyright © 2016-2025 Native Dynamics (nativedynamics.com.au) - Trevor Walker

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
import { Decimal } from '@neutrium/math';
import { QuantityDefinition } from './QuantityDefinition.js';
import { QuantityInitParam } from './guards.js';
import { Parser } from './parsers/Parser.js';
export declare class Quantity {
    private static BASE_UNITS;
    private static UNITY;
    private static UNITY_ARRAY;
    private static baseUnitCache;
    private static stringifiedUnitsCache;
    private conversionCache;
    private parser;
    initValue: any;
    scalar: Decimal;
    numerator: string[];
    denominator: string[];
    baseScalar: Decimal;
    signature: number;
    private _isBase;
    private _units;
    private tokenMapper;
    constructor(initValue: QuantityInitParam, initUnits?: string, parser?: Parser<QuantityDefinition>);
    clone(): Quantity;
    add: (other: QuantityInitParam) => Quantity;
    sub: (other: QuantityInitParam) => Quantity;
    mul: (other: QuantityInitParam) => Quantity;
    div: (other: QuantityInitParam) => Quantity;
    pow: (yy: number | string | Decimal) => Quantity;
    inverse: () => Quantity;
    eq: (b: string | number | Quantity) => boolean;
    lt: (b: string | number | Quantity) => boolean;
    lte: (b: string | number | Quantity) => boolean;
    gt: (b: string | number | Quantity) => boolean;
    gte: (b: string | number | Quantity) => boolean;
    same: (b: Quantity) => boolean;
    compareTo: (b: string | number | Quantity) => number;
    isInverse: (b: string | Quantity) => boolean;
    isCompatible: (b: string | number | Quantity) => boolean;
    isUnitless: () => boolean;
    isTemperature: () => boolean;
    isDegrees: () => boolean;
    to(other: string | Quantity): Quantity;
    toBase(): Quantity;
    isBase(): boolean;
    units(): string;
    toBaseUnits(numerator: any, denominator: any): Quantity;
    private updateBaseScalar;
    private stringifyUnits;
}
