/*!
Copyright © 2006-2007 Kevin C. Olbrich
Copyright © 2010-2013 LIM SAS (http://lim.eu) - Julien Sanchez
Copyright © 2016-2025 Native Dynamics (nativedynamics.com.au) - Trevor Walker

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
import { NestedMap, typeguards, compareArray } from "@neutrium/utilities";
import { Decimal } from '@neutrium/decimal';
import { isQuantityDefinition } from './guards.js';
import { NearleyQtyParser } from "./parsers/NearleyQtyParser.js";
import { UnitTokenManager } from "./UnitTokenManager.js";
// Import operators
import { add, sub, mul, div, pow, inverse } from './operations/maths.js';
import { isDegrees, isTemperature, toDegrees, toTemp, toTempK } from "./operations/temperature.js";
import { compareTo, eq, gt, gte, isCompatible, isInverse, isUnitless, lt, lte, same } from './operations/comparison.js';
import { throwIncompatibleUnits } from "./operations/errors.js";
import { unitSignature } from './operations/unit-signatures.js';
import { stringifyUnits } from './operations/unit-strings.js';
const isString = typeguards.isString;
export class Quantity {
    static BASE_UNITS = ["<meter>", "<kilogram>", "<second>", "<mole>", "<farad>", "<ampere>", "<radian>", "<kelvin>", "<temp-K>", "<byte>", "<dollar>", "<candela>", "<each>", "<steradian>", "<bel>"];
    static UNITY = "<1>";
    static UNITY_ARRAY = [Quantity.UNITY];
    static baseUnitCache = {};
    static stringifiedUnitsCache = new NestedMap();
    conversionCache = {};
    parser;
    // Instance variables
    initValue;
    scalar;
    numerator = Quantity.UNITY_ARRAY;
    denominator = Quantity.UNITY_ARRAY;
    baseScalar;
    signature = null;
    _isBase;
    _units;
    tokenMapper;
    //
    //  Allows construction as either new Quantity("3 m") or new Quantity(3, "m")
    //
    constructor(initValue, initUnits, parser = new NearleyQtyParser()) {
        this.tokenMapper = UnitTokenManager.instance;
        this.parser = parser;
        if (isQuantityDefinition(initValue)) {
            this.scalar = initValue.scalar;
            this.numerator = (initValue.numerator && initValue.numerator.length !== 0) ? initValue.numerator : Quantity.UNITY_ARRAY;
            this.denominator = (initValue.denominator && initValue.denominator.length !== 0) ? initValue.denominator : Quantity.UNITY_ARRAY;
        }
        else {
            let parserResult = {};
            if (initUnits) // Todo type guard properly
             {
                parserResult = this.parser.parse(initUnits);
                parserResult.scalar = new Decimal(initValue);
            }
            else if (typeof initValue === 'string') {
                parserResult = this.parser.parse(initValue);
            }
            else {
                throw new Error("Parameters do not match accpeted types");
            }
            this.scalar = parserResult.scalar;
            this.numerator = parserResult.numerator;
            this.denominator = parserResult.denominator;
        }
        // math with temperatures is very limited
        if (this.denominator.join("*").indexOf("temp") >= 0) {
            throw new Error("Cannot divide with temperatures");
        }
        if (this.numerator.join("*").indexOf("temp") >= 0) {
            if (this.numerator.length > 1) {
                throw new Error("Cannot multiply by temperatures");
            }
            if (!compareArray(this.denominator, Quantity.UNITY_ARRAY)) {
                throw new Error("Cannot divide with temperatures");
            }
        }
        this.initValue = initValue;
        this.updateBaseScalar();
        if (this.isTemperature() && this.baseScalar.lt(0)) {
            throw new Error("Temperatures must not be less than absolute zero");
        }
    }
    clone() {
        return new Quantity(this);
    }
    //
    // Mathematical operations on quantities
    //
    add = (other) => add(this, other);
    sub = (other) => sub(this, other);
    mul = (other) => mul(this, other);
    div = (other) => div(this, other);
    pow = (yy) => pow(this, yy);
    inverse = () => inverse(this);
    //
    // Quantity comparison functions
    //
    eq = (b) => eq(this, b);
    lt = (b) => lt(this, b);
    lte = (b) => lte(this, b);
    gt = (b) => gt(this, b);
    gte = (b) => gte(this, b);
    same = (b) => same(this, b);
    compareTo = (b) => compareTo(this, b);
    isInverse = (b) => isInverse(this, b);
    isCompatible = (b) => isCompatible(this, b);
    isUnitless = () => isUnitless(this);
    //
    // Temperature handling functions
    //
    isTemperature = () => isTemperature(this);
    isDegrees = () => isDegrees(this);
    //
    // Converts to other compatible units.
    // Instance's converted quantities are cached for faster subsequent calls.
    //
    // @param {(string|Quantity)} other - Target units as string or retrieved from
    //                            other Qty instance (scalar is ignored)
    //
    // @returns {Qty} New converted Qty instance with target units
    //
    // @throws {QtyError} if target units are incompatible
    //
    // @example
    // let weight = Quantity("25 kg");
    // weight.to("lb"); // => Quantity("55.11556554621939 lbs");
    // weight.to(Quantity("3 g")); // => Quantity("25000 g"); // scalar of passed Qty is ignored
    //
    to(other) {
        let cached, target;
        if (!other) {
            return this;
        }
        if (!isString(other)) {
            return this.to(other.units());
        }
        cached = this.conversionCache[other];
        if (cached) {
            return cached;
        }
        // Instantiating target to normalize units
        target = new Quantity(other);
        if (target.units() === this.units()) {
            return this;
        }
        if (!this.isCompatible(target)) {
            if (this.isInverse(target)) {
                target = this.inverse().to(other);
            }
            else {
                throwIncompatibleUnits();
            }
        }
        else {
            if (target.isTemperature()) {
                target = toTemp(this, target);
            }
            else if (target.isDegrees()) {
                target = toDegrees(this, target);
            }
            else {
                let q = this.baseScalar.div(target.baseScalar);
                target = new Quantity({
                    scalar: q,
                    numerator: target.numerator,
                    denominator: target.denominator
                });
            }
        }
        this.conversionCache[other] = target;
        return target;
    }
    //
    // Convert to base SI units and cache the results for future performance
    //
    toBase() {
        if (this.isBase()) {
            return this;
        }
        if (this.isTemperature()) {
            return toTempK(this);
        }
        let cached = Quantity.baseUnitCache[this.units()];
        if (!cached) {
            cached = this.toBaseUnits(this.numerator, this.denominator);
            Quantity.baseUnitCache[this.units()] = cached;
        }
        return cached.mul(this.scalar);
    }
    isBase() {
        if (this._isBase !== undefined) {
            return this._isBase;
        }
        if (this.isDegrees() && this.numerator[0].match(/<(kelvin|temp-K)>/)) {
            this._isBase = true;
            return this._isBase;
        }
        this.numerator.concat(this.denominator).forEach(function (item) {
            if (item !== Quantity.UNITY && Quantity.BASE_UNITS.indexOf(item) === -1) {
                this._isBase = false;
            }
        }, this);
        if (this._isBase === false) {
            return this._isBase;
        }
        this._isBase = true;
        return this._isBase;
    }
    units() {
        if (this._units !== undefined) {
            return this._units;
        }
        let numIsUnity = compareArray(this.numerator, Quantity.UNITY_ARRAY), denIsUnity = compareArray(this.denominator, Quantity.UNITY_ARRAY);
        if (numIsUnity && denIsUnity) {
            this._units = "";
            return this._units;
        }
        let numUnits = this.stringifyUnits(this.numerator), denUnits = this.stringifyUnits(this.denominator);
        this._units = numUnits + (denIsUnity ? "" : ("/" + denUnits));
        return this._units;
    }
    toBaseUnits(numerator, denominator) {
        let num = [], den = [], q = new Decimal(1), token;
        for (let i = 0; i < numerator.length; i++) {
            token = numerator[i];
            let unit = this.tokenMapper.getUnit(token);
            if (unit) {
                q = q.mul(unit.scalar);
                if (unit.numerator) {
                    num.push(unit.numerator);
                }
                if (unit.denominator) {
                    den.push(unit.denominator);
                }
            }
        }
        for (let j = 0; j < denominator.length; j++) {
            token = denominator[j];
            let unit = this.tokenMapper.getUnit(token);
            if (unit) {
                q = q.div(unit.scalar);
                if (unit.numerator) {
                    den.push(unit.numerator);
                }
                if (unit.denominator) {
                    num.push(unit.denominator);
                }
            }
        }
        // Flatten
        num = num.reduce((a, b) => a.concat(b), []);
        den = den.reduce((a, b) => a.concat(b), []);
        return new Quantity({
            scalar: q,
            numerator: num,
            denominator: den
        });
    }
    updateBaseScalar() {
        if (this.baseScalar) {
            return;
        }
        if (this.isBase()) {
            this.baseScalar = this.scalar;
            this.signature = unitSignature(this);
        }
        else {
            let base = this.toBase();
            this.baseScalar = base.scalar;
            this.signature = base.signature;
        }
    }
    ;
    //
    // Returns a string representing a normalized unit array and caches the result
    //
    // @param {string[]} units Normalized unit array
    // @returns {string} String representing passed normalized unit array and suitable for output
    //
    stringifyUnits(units) {
        let stringified = Quantity.stringifiedUnitsCache.get(units);
        if (stringified && typeof stringified === 'string') {
            return stringified;
        }
        else {
            stringified = stringifyUnits(units);
            // Cache result
            Quantity.stringifiedUnitsCache.set(units, stringified);
            return stringified;
        }
    }
}
