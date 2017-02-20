/*!
Copyright © 2006-2007 Kevin C. Olbrich
Copyright © 2010-2013 LIM SAS (http://lim.eu) - Julien Sanchez
Copyright © 2016 Native Dynamics (nativedynamics.com.au) - Trevor Walker

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
import { IQuantityDefinition } from "./DefinitionObject";
import { Decimal } from '@neutrium/math';
export declare class Quantity {
    private static PREFIXES;
    private static UNITS;
    private static BASE_UNITS;
    private static SIGNATURE_VECTOR;
    private static UNITY;
    private static UNITY_ARRAY;
    private static parsedUnitsCache;
    private static baseUnitCache;
    private static stringifiedUnitsCache;
    private conversionCache;
    private static PREFIX_VALUES;
    private static PREFIX_MAP;
    private static UNIT_VALUES;
    private static UNIT_MAP;
    private static OUTPUT_MAP;
    private static SIGN;
    private static INTEGER;
    private static SIGNED_INTEGER;
    private static FRACTION;
    private static FLOAT;
    private static EXPONENT;
    private static SCI_NUMBER;
    private static SIGNED_NUMBER;
    private static QTY_STRING;
    private static QTY_STRING_REGEX;
    private static POWER_OP;
    private static TOP_REGEX;
    private static BOTTOM_REGEX;
    private static BOUNDARY_REGEX;
    private static PREFIX_REGEX;
    private static UNIT_REGEX;
    private static UNIT_MATCH;
    private static UNIT_MATCH_REGEX;
    private static UNIT_TEST_REGEX;
    private static FIVE_NINTHS;
    private static NINE_FIFTHS;
    initValue: any;
    scalar: Decimal;
    numerator: string[];
    denominator: string[];
    baseScalar: Decimal;
    signature: number;
    private _isBase;
    private _units;
    static initialize(): void;
    constructor(initValue: string | number | Decimal | IQuantityDefinition, initUnits?: string);
    clone(): Quantity;
    to(other: any): any;
    isCompatible(other: any): any;
    toBase(): any;
    isBase(): boolean;
    inverse(): Quantity;
    units(): string;
    isInverse(other: string | Quantity): any;
    isDegrees(): boolean;
    isTemperature(): boolean;
    isUnitless(): boolean;
    add(other: any): Quantity;
    sub(other: any): Quantity;
    mul(other: any): Quantity;
    div(other: any): Quantity;
    compareTo(other: any): any;
    eq(other: string | Quantity): boolean;
    lt(other: string | Quantity): boolean;
    lte(other: string | Quantity): boolean;
    gt(other: string | Quantity): boolean;
    gte(other: string | Quantity): boolean;
    same(other: Quantity): boolean;
    private parse(val);
    private static parseUnits(units);
    toBaseUnits(numerator: any, denominator: any): Quantity;
    private toTemp(src, dst);
    private toTempK(qty);
    private toDegrees(src, dst);
    private toDegK(qty);
    private subtractTemperatures(lhs, rhs);
    private subtractTempDegrees(temp, deg);
    private addTempDegrees(temp, deg);
    private getDegreeUnits(units);
    private updateBaseScalar();
    private unitSignature();
    private unitSignatureVector();
    private isString(value);
    private stringifyUnits(units);
    private simplify(units);
    private getOutputNames(units);
    cleanTerms(num: any, den: any): any[];
    private throwIncompatibleUnits();
}
