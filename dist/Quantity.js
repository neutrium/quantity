"use strict";
/*!
Copyright © 2006-2007 Kevin C. Olbrich
Copyright © 2010-2013 LIM SAS (http://lim.eu) - Julien Sanchez
Copyright © 2016 Native Dynamics (nativedynamics.com.au) - Trevor Walker

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
Object.defineProperty(exports, "__esModule", { value: true });
var utilities_1 = require("@neutrium/utilities");
var index_1 = require("./index");
var math_1 = require("@neutrium/math");
var isNumber = utilities_1.typeguards.isNumber;
var isString = utilities_1.typeguards.isString;
var Quantity = /** @class */ (function () {
    //
    //  Allows construction as either new Quantity("3 m") or new Quantity(3, "m")
    //
    function Quantity(initValue, initUnits) {
        this.conversionCache = {};
        this.numerator = Quantity.UNITY_ARRAY;
        this.denominator = Quantity.UNITY_ARRAY;
        this.signature = null;
        // Need the definition object its used throughout -> make interface
        if (index_1.isQuantityDefinition(initValue)) {
            this.scalar = initValue.scalar;
            this.numerator = (initValue.numerator && initValue.numerator.length !== 0) ? initValue.numerator : Quantity.UNITY_ARRAY;
            this.denominator = (initValue.denominator && initValue.denominator.length !== 0) ? initValue.denominator : Quantity.UNITY_ARRAY;
        }
        else if (initUnits) {
            this.parse.call(this, initUnits);
            this.scalar = new math_1.Decimal(initValue);
        }
        else {
            this.parse.call(this, initValue);
        }
        // math with temperatures is very limited
        if (this.denominator.join("*").indexOf("temp") >= 0) {
            throw new Error("Cannot divide with temperatures");
        }
        if (this.numerator.join("*").indexOf("temp") >= 0) {
            if (this.numerator.length > 1) {
                throw new Error("Cannot multiply by temperatures");
            }
            if (!utilities_1.compareArray(this.denominator, Quantity.UNITY_ARRAY)) {
                throw new Error("Cannot divide with temperatures");
            }
        }
        this.initValue = initValue;
        this.updateBaseScalar.call(this);
        if (this.isTemperature() && this.baseScalar.lt(0)) {
            throw new Error("Temperatures must not be less than absolute zero");
        }
    }
    Quantity.initialize = function () {
        var definition = null;
        for (var prefix in Quantity.PREFIXES) {
            definition = Quantity.PREFIXES[prefix];
            Quantity.PREFIX_VALUES[prefix] = definition[1];
            Quantity.OUTPUT_MAP[prefix] = definition[0][0];
            for (var i = 0; i < definition[0].length; i++) {
                Quantity.PREFIX_MAP[definition[0][i]] = prefix;
            }
        }
        for (var categoryDef in Quantity.UNITS) {
            var category = Quantity.UNITS[categoryDef];
            for (var unitDef in category.units) {
                definition = category.units[unitDef];
                Quantity.UNIT_VALUES[unitDef] = {
                    scalar: definition[1],
                    numerator: category.numerator,
                    denominator: category.denominator,
                    category: categoryDef
                };
                for (var j = 0; j < definition[0].length; j++) {
                    Quantity.UNIT_MAP[definition[0][j]] = unitDef;
                }
                // Might not need output map
                Quantity.OUTPUT_MAP[unitDef] = definition[0][0];
            }
        }
        Quantity.PREFIX_REGEX = Object.keys(Quantity.PREFIX_MAP).sort(function (a, b) {
            return b.length - a.length;
        }).join("|");
        Quantity.UNIT_REGEX = Object.keys(Quantity.UNIT_MAP).sort(function (a, b) {
            return b.length - a.length;
        }).join("|").replace(/(\(|\))/g, '\\$1');
        //Minimal boundary regex to support units with Unicode characters. \b only works for ASCII
        Quantity.UNIT_MATCH = "(" + Quantity.PREFIX_REGEX + ")??(" + Quantity.UNIT_REGEX + ")(?:" + Quantity.BOUNDARY_REGEX + ")";
        Quantity.UNIT_MATCH_REGEX = new RegExp(Quantity.UNIT_MATCH, "g"); // g flag for multiple occurences
        //UNIT_TEST_REGEX = new RegExp("^\\s*(" + UNIT_MATCH + "\\s*\\*?\\s*)+$");
        Quantity.UNIT_TEST_REGEX = new RegExp("^\\s*(" + Quantity.UNIT_MATCH + "\\s*(\\.?|\\*?)\\s*)+$"); // Try also to get . as in kg.s as kg*s
    };
    Quantity.prototype.clone = function () {
        return new Quantity(this);
    };
    //
    // Converts to other compatible units.
    // Instance's converted quantities are cached for faster subsequent calls.
    //
    // @param {(string|Quantity)} other - Target units as string or retrieved from
    //                               other Qty instance (scalar is ignored)
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
    Quantity.prototype.to = function (other) {
        var cached, target;
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
                this.throwIncompatibleUnits();
            }
        }
        else {
            if (target.isTemperature()) {
                target = this.toTemp(this, target);
            }
            else if (target.isDegrees()) {
                target = this.toDegrees(this, target);
            }
            else {
                var q = this.baseScalar.div(target.baseScalar);
                target = new Quantity({
                    scalar: q,
                    numerator: target.numerator,
                    denominator: target.denominator
                });
            }
        }
        this.conversionCache[other] = target;
        return target;
    };
    //
    // check to see if units are compatible, but not the scalar part
    // this check is done by comparing signatures for performance reasons
    // if passed a string, it will create a unit object with the string and then do the comparison
    // this permits a syntax like:
    // unit =~ "mm"
    // if you want to do a regexp on the unit string do this ...
    // unit.units =~ /regexp/
    //
    Quantity.prototype.isCompatible = function (other) {
        if (isString(other)) {
            return this.isCompatible(new Quantity(other));
        }
        if (!(other instanceof Quantity)) {
            return false;
        }
        if (other.signature !== undefined) {
            return this.signature === other.signature;
        }
        else {
            return false;
        }
    };
    // convert to base SI units
    // results of the conversion are cached so subsequent calls to this will be fast
    Quantity.prototype.toBase = function () {
        if (this.isBase()) {
            return this;
        }
        if (this.isTemperature()) {
            return this.toTempK(this);
        }
        var cached = Quantity.baseUnitCache[this.units()];
        if (!cached) {
            cached = this.toBaseUnits(this.numerator, this.denominator);
            Quantity.baseUnitCache[this.units()] = cached;
        }
        return cached.mul(this.scalar);
    };
    Quantity.prototype.isBase = function () {
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
    };
    // Returns a Qty that is the inverse of this Qty,
    Quantity.prototype.inverse = function () {
        if (this.isTemperature()) {
            throw new Error("Cannot divide with temperatures");
        }
        if (this.scalar.eq(0)) {
            throw new Error("Divide by zero");
        }
        return new Quantity({
            scalar: new math_1.Decimal(1).div(this.scalar),
            numerator: this.denominator,
            denominator: this.numerator
        });
    };
    Quantity.prototype.units = function () {
        if (this._units !== undefined) {
            return this._units;
        }
        var numIsUnity = utilities_1.compareArray(this.numerator, Quantity.UNITY_ARRAY), denIsUnity = utilities_1.compareArray(this.denominator, Quantity.UNITY_ARRAY);
        if (numIsUnity && denIsUnity) {
            this._units = "";
            return this._units;
        }
        var numUnits = this.stringifyUnits(this.numerator), denUnits = this.stringifyUnits(this.denominator);
        this._units = numUnits + (denIsUnity ? "" : ("/" + denUnits));
        return this._units;
    };
    Quantity.prototype.isInverse = function (other) {
        return this.inverse().isCompatible(other);
    };
    Quantity.prototype.isDegrees = function () {
        // signature may not have been calculated yet
        return (this.signature === null || this.signature === 400) &&
            this.numerator.length === 1 &&
            utilities_1.compareArray(this.denominator, Quantity.UNITY_ARRAY) &&
            (/<temp-[CFRK]>/.test(this.numerator[0]) || /<(kelvin|celsius|rankine|fahrenheit)>/.test(this.numerator[0]));
    };
    Quantity.prototype.isTemperature = function () {
        return this.isDegrees() && /<temp-[CFRK]>/.test(this.numerator[0]);
    };
    // returns true if no associated units
    // false, even if the units are "unitless" like 'radians, each, etc'
    Quantity.prototype.isUnitless = function () {
        return utilities_1.compareArray(this.numerator, Quantity.UNITY_ARRAY) && utilities_1.compareArray(this.denominator, Quantity.UNITY_ARRAY);
    };
    //
    // Mathematical operations on quantities
    //
    Quantity.prototype.add = function (other) {
        if (!index_1.isQuantityDefinition(other)) {
            other = new Quantity(other);
        }
        if (!this.isCompatible(other)) {
            this.throwIncompatibleUnits();
        }
        if (this.isTemperature() && other.isTemperature()) {
            throw new Error("Cannot add two temperatures");
        }
        else if (this.isTemperature()) {
            return this.addTempDegrees(this, other);
        }
        else if (other.isTemperature()) {
            return this.addTempDegrees(other, this);
        }
        return new Quantity({
            scalar: this.scalar.add(other.to(this).scalar),
            numerator: this.numerator,
            denominator: this.denominator
        });
    };
    Quantity.prototype.sub = function (other) {
        if (!index_1.isQuantityDefinition(other)) {
            other = new Quantity(other);
        }
        if (!this.isCompatible(other)) {
            this.throwIncompatibleUnits();
        }
        if (this.isTemperature() && other.isTemperature()) {
            return this.subtractTemperatures(this, other);
        }
        else if (this.isTemperature()) {
            return this.subtractTempDegrees(this, other);
        }
        else if (other.isTemperature()) {
            throw new Error("Cannot subtract a temperature from a differential degree unit");
        }
        return new Quantity({
            scalar: this.scalar.sub(other.to(this).scalar),
            numerator: this.numerator,
            denominator: this.denominator
        });
    };
    Quantity.prototype.mul = function (other) {
        if (isNumber(other) || other instanceof math_1.Decimal) {
            return new Quantity({
                scalar: this.scalar.mul(other),
                numerator: this.numerator,
                denominator: this.denominator
            });
        }
        else if (!index_1.isQuantityDefinition(other)) {
            other = new Quantity(other);
        }
        if ((this.isTemperature() || other.isTemperature()) && !(this.isUnitless() || other.isUnitless())) {
            throw new Error("Cannot multiply by temperatures");
        }
        // Quantities should be multiplied with same units if compatible, with base units else
        var op1 = this, op2 = other;
        // so as not to confuse results, multiplication and division between temperature degrees will maintain original unit info in num/den
        // multiplication and division between deg[CFRK] can never factor each other out, only themselves: "degK*degC/degC^2" == "degK/degC"
        if (op1.isCompatible(op2) && op1.signature !== 400) {
            op2 = op2.to(op1);
        }
        var numden = this.cleanTerms(op1.numerator.concat(op2.numerator), op1.denominator.concat(op2.denominator));
        return new Quantity({
            scalar: op1.scalar.mul(op2.scalar),
            numerator: numden[0],
            denominator: numden[1]
        });
    };
    Quantity.prototype.pow = function (yy) {
        yy = new math_1.Decimal(yy);
        if (!yy.isInt()) {
            throw Error("Raising quantities to a fractional power not currently supported");
        }
        var num = this.numerator, den = this.denominator;
        for (var i = 1, len = yy.abs().toNumber(); i < len; i++) {
            num = num.concat(this.numerator);
            den = den.concat(this.denominator);
        }
        // Invert units for negative powers
        if (yy.s < 0) {
            var temp = num;
            num = den;
            den = temp;
        }
        var numden = this.cleanTerms(num, den);
        return new Quantity({
            scalar: this.scalar.pow(yy),
            numerator: numden[0],
            denominator: numden[1]
        });
    };
    Quantity.prototype.div = function (other) {
        if (isNumber(other) || other instanceof math_1.Decimal) {
            return new Quantity({
                "scalar": this.scalar.div(other),
                "numerator": this.numerator,
                "denominator": this.denominator
            });
        }
        else if (!index_1.isQuantityDefinition(other)) {
            other = new Quantity(other);
        }
        if (other.isTemperature()) {
            throw new Error("Cannot divide with temperatures");
        }
        else if (this.isTemperature() && !other.isUnitless()) {
            throw new Error("Cannot divide with temperatures");
        }
        // Quantities should be multiplied with same units if compatible, with base units else
        var op1 = this, op2 = other;
        // so as not to confuse results, multiplication and division between temperature degrees will maintain original unit info in num/den
        // multiplication and division between deg[CFRK] can never factor each other out, only themselves: "degK*degC/degC^2" == "degK/degC"
        if (op1.isCompatible(op2) && op1.signature !== 400) {
            op2 = op2.to(op1);
        }
        var numden = this.cleanTerms(op1.numerator.concat(op2.denominator), op1.denominator.concat(op2.numerator));
        return new Quantity({
            scalar: op1.scalar.div(op2.scalar),
            numerator: numden[0],
            denominator: numden[1]
        });
    };
    // Comparative functions
    // Compare two Qty objects. Throws an exception if they are not of compatible types.
    // Comparisons are done based on the value of the quantity in base SI units.
    //
    // NOTE: We cannot compare inverses as that breaks the general compareTo contract:
    //   if a.compareTo(b) < 0 then b.compareTo(a) > 0
    //   if a.compareTo(b) == 0 then b.compareTo(a) == 0
    //
    //   Since "10S" == ".1ohm" (10 > .1) and "10ohm" == ".1S" (10 > .1)
    //     Qty("10S").inverse().compareTo("10ohm") == -1
    //     Qty("10ohm").inverse().compareTo("10S") == -1
    //
    //   If including inverses in the sort is needed, I suggest writing: Qty.sort(qtyArray,units)
    Quantity.prototype.compareTo = function (other) {
        if (isString(other)) {
            return this.compareTo(new Quantity(other));
        }
        if (!this.isCompatible(other)) {
            this.throwIncompatibleUnits();
        }
        if (this.baseScalar.lt(other.baseScalar)) {
            return -1;
        }
        else if (this.baseScalar.eq(other.baseScalar)) {
            return 0;
        }
        else if (this.baseScalar.gt(other.baseScalar)) {
            return 1;
        }
    };
    Quantity.prototype.eq = function (other) {
        return this.compareTo(other) === 0;
    };
    Quantity.prototype.lt = function (other) {
        return this.compareTo(other) === -1;
    };
    Quantity.prototype.lte = function (other) {
        return this.eq(other) || this.lt(other);
    };
    Quantity.prototype.gt = function (other) {
        return this.compareTo(other) === 1;
    };
    Quantity.prototype.gte = function (other) {
        return this.eq(other) || this.gt(other);
    };
    // Return true if quantities and units match
    // Quantity("100 cm").same(Quantity("100 cm"))  # => true
    // Quantity("100 cm").same(Quantity("1 m"))     # => false
    Quantity.prototype.same = function (other) {
        return this.scalar.eq(other.scalar) && (this.units() === other.units());
    };
    // Parse a string into a unit object.
    // Typical formats like :
    // "5.6 kg*m/s^2"
    // "5.6 kg*m*s^-2"
    // "5.6 kilogram*meter*second^-2"
    // "2.2 kPa"
    // "37 degC"
    // "1"  -- creates a unitless constant with value 1
    // "GPa"  -- creates a unit with scalar 1 with units 'GPa'
    // 6'4"  -- recognized as 6 feet + 4 inches
    // 8 lbs 8 oz -- recognized as 8 lbs + 8 ounces
    //
    Quantity.prototype.parse = function (val) {
        val = (val + '').trim();
        if (val.length === 0) {
            throw new Error("Unit not recognized");
        }
        var result = Quantity.QTY_STRING_REGEX.exec(val);
        if (!result) {
            throw new Error(val + ": Quantity not recognized");
        }
        var scalarMatch = result[1];
        if (scalarMatch) {
            // Allow whitespaces between sign and scalar for loose parsing
            scalarMatch = scalarMatch.replace(/\s/g, "");
            this.scalar = new math_1.Decimal(scalarMatch);
        }
        else {
            this.scalar = new math_1.Decimal(1);
        }
        var top = result[2], bottom = result[3], n, x, nx;
        // TODO DRY me
        while ((result = Quantity.TOP_REGEX.exec(top))) {
            n = parseFloat(result[2]);
            if (isNaN(n)) {
                // Prevents infinite loops
                throw new Error("Unit exponent is not a number");
            }
            // Disallow unrecognized unit even if exponent is 0
            if (n === 0 && !Quantity.UNIT_TEST_REGEX.test(result[1])) {
                throw new Error("Unit not recognized");
            }
            x = result[1] + " ";
            nx = "";
            for (var i = 0; i < Math.abs(n); i++) {
                nx += x;
            }
            if (n >= 0) {
                top = top.replace(result[0], nx);
            }
            else {
                bottom = bottom ? bottom + nx : nx;
                top = top.replace(result[0], "");
            }
        }
        while ((result = Quantity.BOTTOM_REGEX.exec(bottom))) {
            n = parseFloat(result[2]);
            if (isNaN(n)) {
                // Prevents infinite loops
                throw new Error("Unit exponent is not a number");
            }
            // Disallow unrecognized unit even if exponent is 0
            if (n === 0 && !Quantity.UNIT_TEST_REGEX.test(result[1])) {
                throw new Error("Unit not recognized");
            }
            x = result[1] + " ";
            nx = "";
            for (var j = 0; j < n; j++) {
                nx += x;
            }
            //bottom = bottom.replace(new RegExp(result[0].replace("^", "\\^"), "g"), nx);
            bottom = bottom.replace(result[0], nx);
        }
        if (top) {
            this.numerator = Quantity.parseUnits(top.trim());
        }
        if (bottom) {
            this.denominator = Quantity.parseUnits(bottom.trim());
        }
    };
    //
    // Parses and converts units string to normalized unit array.
    // Result is cached to speed up next calls.
    //
    // @param {string} units Units string
    // @returns {string[]} Array of normalized units
    //
    // @example
    // // Returns ["<second>", "<meter>", "<second>"]
    // parseUnits("s m s");
    //
    Quantity.parseUnits = function (units) {
        var cacheKey = units, cached = Quantity.parsedUnitsCache[units], unitMatch, normalizedUnits = [];
        if (cached) {
            return cached;
        }
        // Strip out
        units = units.replace(/(\.|\*)/g, ' ');
        // Scan
        if (!Quantity.UNIT_TEST_REGEX.test(units)) {
            throw new Error("Unit not recognized");
        }
        while ((unitMatch = Quantity.UNIT_MATCH_REGEX.exec(units))) {
            normalizedUnits.push(unitMatch.slice(1));
        }
        normalizedUnits = normalizedUnits.map(function (item) {
            return Quantity.PREFIX_MAP[item[0]] ? [Quantity.PREFIX_MAP[item[0]], Quantity.UNIT_MAP[item[1]]] : [Quantity.UNIT_MAP[item[1]]];
        });
        // Flatten and remove null elements
        normalizedUnits = normalizedUnits.reduce(function (a, b) {
            return a.concat(b);
        }, []);
        normalizedUnits = normalizedUnits.filter(function (item) {
            return item;
        });
        Quantity.parsedUnitsCache[cacheKey] = normalizedUnits;
        return normalizedUnits;
    };
    Quantity.prototype.toBaseUnits = function (numerator, denominator) {
        var num = [], den = [], q = new math_1.Decimal(1), unit;
        for (var i = 0; i < numerator.length; i++) {
            unit = numerator[i];
            if (Quantity.PREFIX_VALUES[unit]) {
                q = q.mul(Quantity.PREFIX_VALUES[unit]);
            }
            else {
                unit = Quantity.UNIT_VALUES[unit];
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
        }
        for (var j = 0; j < denominator.length; j++) {
            unit = denominator[j];
            if (Quantity.PREFIX_VALUES[unit]) {
                q = q.div(Quantity.PREFIX_VALUES[unit]);
            }
            else {
                unit = Quantity.UNIT_VALUES[unit];
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
        }
        // Flatten
        num = num.reduce(function (a, b) {
            return a.concat(b);
        }, []);
        den = den.reduce(function (a, b) {
            return a.concat(b);
        }, []);
        return new Quantity({
            scalar: q,
            numerator: num,
            denominator: den
        });
    };
    // Temperature handling functions
    Quantity.prototype.toTemp = function (src, dst) {
        var dstUnits = dst.units(), dstScalar;
        switch (dstUnits) {
            case "tempK":
                dstScalar = src.baseScalar;
                break;
            case "tempC":
                dstScalar = src.baseScalar.sub("273.15");
                break;
            case "tempF":
                dstScalar = src.baseScalar.mul(Quantity.NINE_FIFTHS).sub("459.67");
                break;
            case "tempR":
                dstScalar = src.baseScalar.mul(Quantity.NINE_FIFTHS);
                break;
            default:
                throw new Error("Unknown type for temp conversion to: " + dstUnits);
        }
        return new Quantity({
            scalar: dstScalar,
            numerator: dst.numerator,
            denominator: dst.denominator
        });
    };
    Quantity.prototype.toTempK = function (qty) {
        var units = qty.units(), q;
        if (units.match(/(deg)[CFRK]/)) {
            q = qty.baseScalar;
        }
        else {
            switch (units) {
                case "tempK":
                    q = qty.scalar;
                    break;
                case "tempC":
                    q = qty.scalar.add("273.15");
                    break;
                case "tempF":
                    q = qty.scalar.add("459.67").mul(Quantity.FIVE_NINTHS);
                    break;
                case "tempR":
                    q = qty.scalar.mul(Quantity.FIVE_NINTHS);
                    break;
                default:
                    throw new Error("Unknown type for temp conversion from: " + units);
            }
        }
        return new Quantity({
            scalar: q,
            numerator: ["<temp-K>"],
            denominator: Quantity.UNITY_ARRAY
        });
    };
    Quantity.prototype.toDegrees = function (src, dst) {
        var srcDegK = this.toDegK(src), dstUnits = dst.units(), dstScalar;
        switch (dstUnits) {
            case "degK":
                dstScalar = srcDegK.scalar;
                break;
            case "degC":
                dstScalar = srcDegK.scalar;
                break;
            case "degF":
                dstScalar = srcDegK.scalar.mul(Quantity.NINE_FIFTHS);
                break;
            case "degR":
                dstScalar = srcDegK.scalar.mul(Quantity.NINE_FIFTHS);
                break;
            default:
                throw new Error("Unknown type for degree conversion to: " + dstUnits);
        }
        return new Quantity({
            scalar: dstScalar,
            numerator: dst.numerator,
            denominator: dst.denominator
        });
    };
    Quantity.prototype.toDegK = function (qty) {
        var units = qty.units(), q;
        if (units.match(/(deg)[CFRK]/)) {
            q = qty.baseScalar;
        }
        else {
            switch (units) {
                case "tempK":
                    q = qty.scalar;
                    break;
                case "tempC":
                    q = qty.scalar;
                    break;
                case "tempF":
                    q = qty.scalar.mul(Quantity.FIVE_NINTHS);
                    break;
                case "tempR":
                    q = qty.scalar.mul(Quantity.FIVE_NINTHS);
                    break;
                default: throw new Error("Unknown type for temp conversion from: " + units);
            }
        }
        return new Quantity({
            scalar: q,
            numerator: ["<kelvin>"],
            denominator: Quantity.UNITY_ARRAY
        });
    };
    Quantity.prototype.subtractTemperatures = function (lhs, rhs) {
        var lhsUnits = lhs.units(), rhsConverted = rhs.to(lhsUnits), dstDegrees = new Quantity(this.getDegreeUnits(lhsUnits));
        return new Quantity({
            scalar: lhs.scalar.sub(rhsConverted.scalar),
            numerator: dstDegrees.numerator,
            denominator: dstDegrees.denominator
        });
    };
    Quantity.prototype.subtractTempDegrees = function (temp, deg) {
        var tempDegrees = deg.to(this.getDegreeUnits(temp.units()));
        return new Quantity({
            scalar: temp.scalar.sub(tempDegrees.scalar),
            numerator: temp.numerator,
            denominator: temp.denominator
        });
    };
    Quantity.prototype.addTempDegrees = function (temp, deg) {
        var tempDegrees = deg.to(this.getDegreeUnits(temp.units()));
        return new Quantity({
            scalar: temp.scalar.add(tempDegrees.scalar),
            numerator: temp.numerator,
            denominator: temp.denominator
        });
    };
    // converts temp[CKFR] to deg[CKFR]
    Quantity.prototype.getDegreeUnits = function (units) {
        var degrees = 'CKFR', unit = units.slice(-1);
        if (degrees.indexOf(unit) !== -1) {
            return 'deg' + unit;
        }
        else {
            throw new Error("Unknown type for temp conversion from: " + units);
        }
    };
    Quantity.prototype.updateBaseScalar = function () {
        if (this.baseScalar) {
            return this.baseScalar;
        }
        if (this.isBase()) {
            this.baseScalar = this.scalar;
            this.signature = this.unitSignature.call(this);
        }
        else {
            var base = this.toBase();
            this.baseScalar = base.scalar;
            this.signature = base.signature;
        }
    };
    ;
    //
    // Calculates the unit signature id for use in comparing compatible units and simplification
    // the signature is based on a simple classification of units and is based on the following publication
    //
    // Novak, G.S., Jr. "Conversion of units of measurement", IEEE Transactions on Software Engineering,
    // 21(8), Aug 1995, pp.651-661
    // doi://10.1109/32.403789
    // http://www.cs.utexas.edu/~novak/units95.html
    //
    Quantity.prototype.unitSignature = function () {
        if (this.signature) {
            return this.signature;
        }
        var vector = this.unitSignatureVector.call(this);
        for (var i = 0, len = vector.length; i < len; i++) {
            vector[i] *= Math.pow(20, i); // Not sure if this equation is correct
        }
        return vector.reduce(function (previous, current) { return previous + current; }, 0);
    };
    ;
    // calculates the unit signature vector used by unit_signature
    Quantity.prototype.unitSignatureVector = function () {
        if (!this.isBase()) {
            return this.unitSignatureVector.call(this.toBase());
        }
        var vector = new Array(Quantity.SIGNATURE_VECTOR.length), r, n;
        for (var i = 0; i < vector.length; i++) {
            vector[i] = 0;
        }
        // Numerator - ["<kilogram>","<meter>"]
        for (var j = 0, len = this.numerator.length; j < len; j++) {
            //Units - "<newton>"  : [["N","Newton","newton"], 1.0, "force", ["<kilogram>","<meter>"], ["<second>","<second>"]],
            if ((r = Quantity.UNIT_VALUES[this.numerator[j]])) {
                n = Quantity.SIGNATURE_VECTOR.indexOf(r.category);
                //SIGNATURE_VECTOR = ["length", "time", "temperature", "mass", "current", "substance", "luminosity", "currency", "memory", "angle", "capacitance"];
                if (n >= 0) {
                    vector[n] = vector[n] + 1;
                }
            }
        }
        for (var k = 0, len = this.denominator.length; k < len; k++) {
            if ((r = Quantity.UNIT_VALUES[this.denominator[k]])) {
                n = Quantity.SIGNATURE_VECTOR.indexOf(r.category);
                if (n >= 0) {
                    vector[n] = vector[n] - 1;
                }
            }
        }
        return vector;
    };
    ;
    //
    // Utility Functions
    //
    //
    // Tests if a value is a string
    //
    // @param {} value - Value to test
    //
    // @returns {boolean} true if value is a string, false otherwise
    //
    Quantity.prototype.isString = function (value) {
        return typeof value === "string" || value instanceof String;
    };
    //
    // Returns a string representing a normalized unit array
    //
    // @param {string[]} units Normalized unit array
    // @returns {string} String representing passed normalized unit array and suitable for output
    //
    Quantity.prototype.stringifyUnits = function (units) {
        var stringified = Quantity.stringifiedUnitsCache.get(units);
        if (stringified && typeof stringified === 'string') {
            return stringified;
        }
        var isUnity = utilities_1.compareArray(units, Quantity.UNITY_ARRAY);
        if (isUnity) {
            stringified = "1";
        }
        else {
            stringified = this.simplify(this.getOutputNames(units)).join("*");
        }
        // Cache result
        Quantity.stringifiedUnitsCache.set(units, stringified);
        return stringified;
    };
    // this turns ['s','m','s'] into ['s2','m']
    Quantity.prototype.simplify = function (units) {
        function reduce(acc, unit) {
            var unitCounter = acc[unit];
            if (!unitCounter) {
                acc.push(unitCounter = acc[unit] = [unit, 0]);
            }
            unitCounter[1]++;
            return acc;
        }
        var unitCounts = units.reduce(reduce, []);
        return unitCounts.map(function (unitCount) {
            return unitCount[0] + (unitCount[1] > 1 ? unitCount[1] : "");
        });
    };
    Quantity.prototype.getOutputNames = function (units) {
        var unitNames = [], token, tokenNext;
        for (var i = 0, len = units.length; i < len; i++) {
            token = units[i];
            tokenNext = units[i + 1];
            if (Quantity.PREFIX_VALUES[token]) {
                unitNames.push(Quantity.OUTPUT_MAP[token] + Quantity.OUTPUT_MAP[tokenNext]);
                i++;
            }
            else {
                unitNames.push(Quantity.OUTPUT_MAP[token]);
            }
        }
        return unitNames;
    };
    Quantity.prototype.cleanTerms = function (num, den) {
        num = num.filter(function (val) { return val !== Quantity.UNITY; });
        den = den.filter(function (val) { return val !== Quantity.UNITY; });
        var combined = {}, k;
        for (var i = 0, len = num.length; i < len; i++) {
            if (Quantity.PREFIX_VALUES[num[i]]) {
                k = [num[i], num[i + 1]];
                i++;
            }
            else {
                k = num[i];
            }
            if (k && k !== Quantity.UNITY) {
                if (combined[k]) {
                    combined[k][0]++;
                }
                else {
                    combined[k] = [1, k];
                }
            }
        }
        for (var j = 0; j < den.length; j++) {
            if (Quantity.PREFIX_VALUES[den[j]]) {
                k = [den[j], den[j + 1]];
                j++;
            }
            else {
                k = den[j];
            }
            if (k && k !== Quantity.UNITY) {
                if (combined[k]) {
                    combined[k][0]--;
                }
                else {
                    combined[k] = [-1, k];
                }
            }
        }
        num = [];
        den = [];
        for (var prop in combined) {
            if (combined.hasOwnProperty(prop)) {
                var item = combined[prop], n = void 0;
                if (item[0] > 0) {
                    for (n = 0; n < item[0]; n++) {
                        num.push(item[1]);
                    }
                }
                else if (item[0] < 0) {
                    for (n = 0; n < -item[0]; n++) {
                        den.push(item[1]);
                    }
                }
            }
        }
        if (num.length === 0) {
            num = Quantity.UNITY_ARRAY;
        }
        if (den.length === 0) {
            den = Quantity.UNITY_ARRAY;
        }
        // Flatten
        num = num.reduce(function (a, b) {
            return a.concat(b);
        }, []);
        den = den.reduce(function (a, b) {
            return a.concat(b);
        }, []);
        return [num, den];
    };
    /*
    * Throws incompatible units error
    *
    * @throws "Incompatible units" error
    */
    Quantity.prototype.throwIncompatibleUnits = function () {
        throw new Error("Incompatible units");
    };
    // Static "constants"
    Quantity.PREFIXES = {
        "<googol>": [["googol"], 1e100],
        "<kibi>": [["Ki", "Kibi", "kibi"], Math.pow(2, 10)],
        "<mebi>": [["Mi", "Mebi", "mebi"], Math.pow(2, 20)],
        "<gibi>": [["Gi", "Gibi", "gibi"], Math.pow(2, 30)],
        "<tebi>": [["Ti", "Tebi", "tebi"], Math.pow(2, 40)],
        "<pebi>": [["Pi", "Pebi", "pebi"], Math.pow(2, 50)],
        "<exi>": [["Ei", "Exi", "exi"], Math.pow(2, 60)],
        "<zebi>": [["Zi", "Zebi", "zebi"], Math.pow(2, 70)],
        "<yebi>": [["Yi", "Yebi", "yebi"], Math.pow(2, 80)],
        "<yotta>": [["Y", "Yotta", "yotta"], 1e24],
        "<zetta>": [["Z", "Zetta", "zetta"], 1e21],
        "<exa>": [["E", "Exa", "exa"], 1e18],
        "<peta>": [["P", "Peta", "peta"], 1e15],
        "<tera>": [["T", "Tera", "tera"], 1e12],
        "<giga>": [["G", "Giga", "giga"], 1e9],
        "<mega>": [["M", "Mega", "mega"], 1e6],
        "<kilo>": [["k", "kilo"], 1e3],
        "<hecto>": [["h", "Hecto", "hecto"], 1e2],
        "<deca>": [["da", "Deca", "deca", "deka"], 1e1],
        "<deci>": [["d", "Deci", "deci"], 1e-1],
        "<centi>": [["c", "Centi", "centi"], 1e-2],
        "<milli>": [["m", "Milli", "milli"], 1e-3],
        "<micro>": [["u", "\u03BC", "\u00B5", "Micro", "mc", "micro"], 1e-6],
        "<nano>": [["n", "Nano", "nano"], 1e-9],
        "<pico>": [["p", "Pico", "pico"], 1e-12],
        "<femto>": [["f", "Femto", "femto"], 1e-15],
        "<atto>": [["a", "Atto", "atto"], 1e-18],
        "<zepto>": [["z", "Zepto", "zepto"], 1e-21],
        "<yocto>": [["y", "Yocto", "yocto"], 1e-24]
    };
    Quantity.UNITS = {
        "": {
            units: {
                "<1>": [["1", "<1>"], 1],
            }
        },
        acceleration: {
            numerator: ["<meter>"],
            denominator: ["<second>", "<second>"],
            units: {
                "<gee>": [["gee", "gforce", "gn"], 9.80665],
            }
        },
        angle: {
            numerator: ["<radian>"],
            units: {
                "<radian>": [["rad", "radian", "radians"], 1.0],
                "<degree>": [["deg", "degree", "degrees"], Math.PI / 180.0],
                "<gradian>": [["gon", "grad", "gradian", "grads"], Math.PI / 200.0],
                "<aminutes>": [["amin", "amins", "arcmin", "arcmins"], 0.0002908882],
                "<aseconds>": [["asec", "asecs", "arcsec", "arcsecs"], 4.8481366667e-6],
                "<amils>": [["amil", "amils"], 9.817477e-4],
                "<octant>": [["octant"], 0.785398163],
                "<quadrant>": [["quadrant", "quadrants"], 1.570796327],
                "<sextant>": [["sextant"], 1.047197551],
                "<rev>": [["rev"], 6.283185307],
                "<compass-pt>": [["cpoint"], 0.196349540849362],
            }
        },
        area: {
            numerator: ["<meter>", "<meter>"],
            units: {
                "<acre>": [["acre", "acres"], 4046.856422],
                "<acre-us>": [["acre(us)", "acres(us)"], 4046.873],
                "<ares>": [["are", "ares"], 100],
                "<barn>": [["barn", "barns"], 1E-28],
                "<dunam>": [["dunam"], 1000],
                "<hectare>": [["ha", "hectare"], 10000],
                "<rood>": [["rood", "roods"], 1011.714106]
            }
        },
        capacitance: {
            numerator: ["<ampere>", "<second>"],
            units: {
                "<farad>": [["F", "farad", "Farad"], 1.0],
            }
        },
        charge: {
            numerator: ["<ampere>", "<second>"],
            units: {
                "<coulomb>": [["C", "coulomb", "Coulomb"], 1.0],
                "<esu>": [["ESU", "esu", "Fr", "statC", "StatC"], 3.335640952e-10],
            }
        },
        currency: {
            numerator: ["<dollar>"],
            units: {
                "<dollar>": [["dollar", "dollars"], 1.0],
                "<cents>": [["cents"], 0.01],
            }
        },
        current: {
            numerator: ["<ampere>"],
            units: {
                "<ampere>": [["A", "Ampere", "ampere", "amp", "amps"], 1.0],
                "<biot>": [["Biot"], 10],
                "<statampere>": [["StatAmpere", "statA", "StatA"], 3.335641E-10]
            }
        },
        data: {
            numerator: ["<byte>"],
            units: {
                "<byte>": [["B", "byte"], 1.0],
                "<bit>": [["b", "bit"], 0.125],
                "<nibble>": [["nibble"], 0.5],
            }
        },
        electricalConductance: {
            numerator: ["<second>", "<second>", "<second>", "<ampere>", "<ampere>"],
            denominator: ["<kilogram>", "<meter>", "<meter>"],
            units: {
                "<siemens>": [["S", "Siemen", "Siemens", "siemens", "mho", "mhos"], 1.0],
                "<statmho>": [["statmho"], 1.112347052e-12]
            }
        },
        electricalInductance: {
            numerator: ["<meter>", "<meter>", "<kilogram>"],
            denominator: ["<second>", "<second>", "<ampere>", "<ampere>"],
            units: {
                "<henry>": [["H", "Henry", "henry"], 1],
                "<abhenry>": [["abH"], 1E-9],
                "<statH>": [["statH", "StatH"], 8.987552E+11],
            }
        },
        electricalPotential: {
            numerator: ["<meter>", "<meter>", "<kilogram>"],
            denominator: ["<second>", "<second>", "<second>", "<ampere>"],
            units: {
                "<volt>": [["V", "Volt", "volt", "volts"], 1.0],
                "<abvolt>": [["abV", "abVolt"], 1E-8],
                "<statvolts>": [["statV"], 299.7925]
            }
        },
        electricalResistance: {
            numerator: ["<meter>", "<meter>", "<kilogram>"],
            denominator: ["<second>", "<second>", "<second>", "<ampere>", "<ampere>"],
            units: {
                "<ohm>": [["Ohm", "ohm", "\u03A9" /*? as greek letter*/, "\u2126" /*? as ohm sign*/], 1.0],
                "<abohm>": [["abOhm"], 1e-9]
            }
        },
        energy: {
            numerator: ["<meter>", "<meter>", "<kilogram>"],
            denominator: ["<second>", "<second>"],
            units: {
                "<btu>": [["BTU", "btu", "BTUs", "Btu"], 1055.055853],
                "<btu-thermo>": [["BTU(th)", "btu(th)", "btus(th)", "Btu(th)"], 1054.35026444],
                "<calorie>": [["cal", "calorie", "calories"], 4.1868],
                "<calorie-IUNS>": [["cal(N)"], 4.182],
                "<calorie-thermo>": [["cal(th)"], 4.184],
                "<erg>": [["erg", "ergs"], 1e-7],
                "<electron-volts>": [["eV"], 1.60217653e-19],
                "<joule>": [["J", "joule", "Joule", "joules"], 1.0],
                "<therm-euro>": [["thm", "therm", "therms", "Therm"], 105505590],
                "<therm-US>": [["thm(us)", "therm(us)", "therms(us)", "Therm(us)"], 105480400],
                "<TNT>": [["tTNT"], 4184000000],
            }
        },
        force: {
            numerator: ["<kilogram>", "<meter>"],
            denominator: ["<second>", "<second>"],
            units: {
                "<newton>": [["N", "Newton", "newton"], 1.0],
                "<dyne>": [["dyn", "dyne"], 1e-5],
                "<gram-force>": [["gf", "gram-force", "pond"], 0.00980665],
                "<kg-force>": [["kgf", "kg-force", "kpond"], 9.80665],
                "<pound-force>": [["lbf", "pound-force"], 4.448221615],
                "<ounce-force>": [["ozf", "ounce-force"], 0.278013851],
                "<poundal>": [["pdl", "poundal"], 0.138254954],
                "<tonne-force>": [["tf", "tonnef"], 9806.65],
                "<ton-force-long>": [["tonlf"], 9964.016418],
                "<ton-force-short>": [["tonsf"], 8896.4432],
            }
        },
        frequency: {
            numerator: ["<radian>"],
            denominator: ["<second>"],
            units: {
                "<hertz>": [["Hz", "hertz", "Hertz", "pers"], 2 * Math.PI],
                "<rpm>": [["rpm", "RPM"], 2 * Math.PI / 60],
            }
        },
        length: {
            numerator: ["<meter>"],
            units: {
                "<meter>": [["m", "meter", "meters", "metre", "metres"], 1.0],
                "<angstrom>": [["Å", "ang", "angstrom", "angstroms"], 1e-10],
                "<AU>": [["AU", "au", "astronomical-unit"], 149597870700],
                "<caliber>": [["caliber",], 0.0254],
                "<chain>": [["chain", "chains",], 20.1168],
                "<chain-us>": [["chain(us)"], 20.116840234],
                "<cubit>": [["cubit",], 0.4572],
                "<cubit-long>": [["cubit(l)",], 0.5334],
                "<fathom>": [["fathom", "fathoms"], 1.8288],
                "<fermi>": [["Fermi"], 1e-15],
                "<finger>": [["finger", "fingers"], 0.1143],
                "<foot>": [["ft", "foot", "feet", "'"], 0.3048],
                "<furlong>": [["furlong", "furlongs"], 201.168],
                "<furlong-us>": [["furlong(us)", "furlong(uss)"], 201.16840234],
                "<gmile>": [["gmile"], 1855.3257],
                "<hand>": [["hand", "hands"], 0.1016],
                "<league>": [["league", "league(us)"], 4828.0417],
                "<inch>": [["in", "inch", "inches", "\""], 0.0254],
                "<link>": [["link", "links"], 0.201168],
                "<link-us>": [["link(us)"], 0.20116840234],
                "<light-minute>": [["lmin", "light-minute"], 17987547480],
                "<light-second>": [["ls", "light-second"], 299792458],
                "<light-year>": [["ly", "light-year"], 9460730472580800],
                "<micron>": [["micron"], 1e-6],
                "<mil>": [["mil", "mils"], 0.0000254, ["<meter>"]],
                "<mile>": [["mi", "mile", "miles"], 1609.344],
                "<nail>": [["nail", "nails"], 0.05715],
                "<naut-league>": [["nleague"], 5556],
                "<naut-league-uk>": [["nleague(uk)"], 5559.552],
                "<naut-mile>": [["nmi"], 1852],
                "<parsec>": [["pc", "parsec", "parsecs"], 30856780000000000],
                "<pica>": [["pica", "picas"], 0.00423333333],
                "<planck-length>": [["Planck"], 1.616252E-35],
                "<point>": [["point", "points"], 0.000352777777777778],
                "<rod>": [["rd", "rod", "rods"], 5.0292],
                "<rod-us>": [["rod(us)"], 5.029210058],
                "<rope>": [["rope", "ropes"], 6.096],
                "<thou>": [["th"], 0.0000254],
                "<span>": [["span"], 0.2286],
                "<yard>": [["yd", "yard", "yards"], 0.9144]
            }
        },
        magneticFlux: {
            numerator: ["<meter>", "<meter>", "<kilogram>"],
            denominator: ["<second>", "<second>", "<ampere>"],
            units: {
                "<weber>": [["Wb", "weber", "webers"], 1.0],
                "<maxwell>": [["Mx", "maxwell", "maxwells"], 1e-8],
                "<line>": [["line"], 1E-8]
            }
        },
        magneticFluxDensity: {
            numerator: ["<kilogram>"],
            denominator: ["<second>", "<second>", "<ampere>"],
            units: {
                "<tesla>": [["T", "tesla", "teslas"], 1],
                "<gauss>": [["G", "gauss"], 1e-4]
            }
        },
        mass: {
            numerator: ["<kilogram>"],
            units: {
                "<kilogram>": [["kg", "kilogram", "kilograms"], 1.0],
                "<AMU>": [["u", "AMU", "amu"], 1.660538921e-27],
                "<carat>": [["ct", "carat", "carats"], 0.0002],
                "<dalton>": [["Da", "Dalton", "Daltons", "dalton", "daltons"], 1.660538921e-27],
                "<dram>": [["dram", "drams", "dr"], 0.0017718452],
                "<gram>": [["g", "gram", "grams", "gramme", "grammes"], 1e-3],
                "<grain>": [["grain", "grains", "gr"], 6.479891E-5],
                "<hundredweight-short>": [["cwt(s)"], 45.359237],
                "<hundredweight-long>": [["cwt(l)"], 50.80234544],
                "<ounce>": [["oz", "ounce", "ounces"], 0.0283495231],
                "<ounce-troy>": [["ozt"], 0.031103477],
                "<pennyweight>": [["dwt"], 0.00155517384],
                "<pound>": [["lbs", "lb", "pound", "pounds", "#"], 0.45359237],
                "<pound-troy>": [["lbt"], 0.3732417],
                "<quarter-short>": [["qr(s)"], 11.33980925],
                "<quarter-long>": [["qr(l)"], 12.70058636],
                "<slug>": [["slug", "slugs"], 14.5939029],
                "<stone>": [["stone", "stones", "st"], 6.35029318],
                "<ton-metric>": [["t", "tonne"], 1000],
                "<ton-long>": [["tnl", "ton(l)", "tonl"], 1016.0469088],
                "<ton-short>": [["tn", "ton", "ton(s)", "tons"], 907.18474],
            }
        },
        power: {
            numerator: ["<kilogram>", "<meter>", "<meter>"],
            denominator: ["<second>", "<second>", "<second>"],
            units: {
                "<watt>": [["W", "watt", "watts"], 1.0],
                "<horsepower>": [["Hp", "hp", "horsepower"], 745.699872],
                "<horsepower-electric>": [["Hp(e)", "hp(e)", "hp(electric)"], 746],
                "<horsepower-metric>": [["Hp(m)", "hp(m)", "Hp(m)"], 735.49875]
            }
        },
        pressure: {
            numerator: ["<kilogram>"],
            denominator: ["<meter>", "<second>", "<second>"],
            units: {
                "<pascal>": [["Pa", "pascal", "Pascal"], 1.0],
                "<at>": [["at"], 98066.5],
                "<atm>": [["atm", "atmosphere", "atmospheres"], 101325],
                "<bar>": [["bar", "bars"], 100000],
                "<barye>": [["barye"], 0.1],
                "<cmh2o>": [["cmH2O"], 98.0638],
                "<cmHg>": [["cmHg"], 1333.223874],
                "<inh2o>": [["inH2O"], 249.082052],
                "<inHg>": [["inHg"], 3386.3881472],
                "<mmh2o>": [["mmH2O"], 9.80665],
                "<mmHg>": [["mmHg"], 133.322387415],
                "<pieze>": [["pieze"], 1000],
                "<psf>": [["psf"], 47.880259],
                "<psi>": [["psi"], 6894.757293],
                "<torr>": [["torr"], 133.322368],
            }
        },
        radiation: {
            numerator: ["<meter>", "<meter>"],
            denominator: ["<second>", "<second>"],
            units: {
                "<gray>": [["Gy", "gray", "grays"], 1.0],
                "<roentgen>": [["R", "roentgen"], 0.009330],
                "<sievert>": [["Sv", "sievert", "sieverts"], 1.0]
            }
        },
        radioactivity: {
            numerator: ["<1>"],
            denominator: ["<second>"],
            units: {
                "<becquerel>": [["Bq", "bequerel", "bequerels"], 1.0],
                "<curie>": [["Ci", "curie", "curies"], 3.7e10]
            }
        },
        sound: {
            numerator: ["<bel>"],
            units: {
                "<bel>": [["Bels", "Bel"], 1],
                "<neper>": [["Neper"], 0.8686]
            }
        },
        substance: {
            numerator: ["<mole>"],
            units: {
                "<mole>": [["mol", "mole"], 1.0],
            }
        },
        temperature: {
            numerator: ["<kelvin>"],
            units: {
                "<kelvin>": [["degK", "kelvin", "K"], 1.0],
                "<celsius>": [["degC", "celsius", "celsius", "centigrade", "C"], 1.0],
                "<fahrenheit>": [["degF", "fahrenheit", "F"], 5 / 9],
                "<rankine>": [["degR", "rankine", "R"], 5 / 9],
                "<temp-K>": [["tempK"], 1.0],
                "<temp-C>": [["tempC"], 1.0],
                "<temp-F>": [["tempF"], 5 / 9],
                "<temp-R>": [["tempR"], 5 / 9],
            }
        },
        time: {
            numerator: ["<second>"],
            units: {
                "<second>": [["s", "sec", "secs", "second", "seconds"], 1],
                "<minute>": [["min", "mins", "minute", "minutes"], 60],
                "<hour>": [["h", "hr", "hrs", "hour", "hours"], 3600],
                "<day>": [["d", "day", "days"], 86400],
                "<week>": [["wk", "week", "weeks"], 604800],
                "<fortnight>": [["fortnight", "fortnights"], 1209600],
                "<month>": [["month", "months"], 2629740],
                "<year>": [["y", "yr", "year", "years", "annum"], 31536000],
                "<year-julian>": [["y(j)", "yr(j)", "year(j)", "years(j)"], 31557600],
                "<year-leap>": [["y(l)", "yr(l)", "year(l)", "years(l)"], 31622400],
                "<year-tropical>": [["tyr", "tyrs"], 31556925.19],
                "<decade>": [["decade", "decades"], 315360000],
                "<century>": [["century", "centuries"], 3153600000],
                "<millienia>": [["millienia", "millenium"], 31536000000],
                "<shake>": [["shake"], 1e-8],
            }
        },
        velocity: {
            numerator: ["<meter>"],
            denominator: ["<second>"],
            units: {
                "<kph>": [["kph"], 0.277777778],
                "<mph>": [["mph"], 0.44704],
                "<knot>": [["kn", "knot", "knots"], 0.514444444],
                "<mach>": [["mach"], 295.0464],
                "<light-speed>": [["lspeed", "light"], 299792458]
            }
        },
        viscosity: {
            numerator: ["<kilogram>"],
            denominator: ["<meter>", "<second>"],
            units: {
                "<poise>": [["P", "poise"], 0.1],
                "<reyn>": [["reyn"], 6894.75729]
            }
        },
        viscosityKinematic: {
            numerator: ["<meter>", "<meter>"],
            denominator: ["<second>"],
            units: {
                "<stoke>": [["St", "Stokes"], 1E-4]
            }
        },
        volume: {
            numerator: ["<meter>", "<meter>", "<meter>"],
            units: {
                "<barrels-us-petroleum>": [["bbl(us)", "bbl"], 0.158987295],
                "<barrels-uk>": [["bl(uk)", "bl(imp)"], 0.16365924],
                "<barrels-us-dry>": [["bl(usd)"], 0.115627124],
                "<barrels-us-liquid>": [["bl(usl)"], 0.119240471],
                "<bushels-us>": [["bu", "bsh", "bushel", "bushel(us)"], 0.035239072],
                "<bushels-uk>": [["bu(uk)", "bushel(uk)", "bushel(imp)"], 0.03636872],
                "<cup-metric>": [["cup", "cup(metric)"], 0.00025],
                "<cup-imperial>": [["cup(imp)"], 2.84130625e-4],
                "<cup-us-customary>": [["cup(usc)"], 2.365882365e-4],
                "<cup-us-legal>": [["cup(usl)"], 0.00024],
                "<dram-fluid>": [["dr(f)", "dram(f)"], 3.6966911953E-06],
                "<drum-metric-petroleum>": [["drum(mp)"], 0.2],
                "<drum-us-petroleum>": [["drum(usp)"], 0.208197648],
                "<fluid-ounce>": [["floz", "fluid-ounce", "fluid-ounces"], 2.84130625e-5],
                "<fluid-ounce-us>": [["oz(usl)", "oz(usf)", "floz(us)"], 2.95735296e-5],
                "<gallon-uk>": [["gal", "gal(imp)", "gal(uk)"], 0.00454609],
                "<gallon-us-dry>": [["gal(usd)", "gal(us dry)"], 0.004404884],
                "<gallon-us-liquid>": [["gal(us)", "gal(usl)", "gal(us fl)"], 0.003785412],
                "<liter>": [["l", "L", "liter", "liters", "litre", "litres"], 0.001],
                "<pecks-uk>": [["peck(uk)", "pecks(uk)"], 0.00909218],
                "<pecks-us>": [["peck(us)", "pecks(us)"], 0.008809768],
                "<pint>": [["pt", "pint", "pints", "pint(us fl)"], 0.000473176475],
                "<pint-uk>": [["pt(uk)", "pint(uk)", "pints(uk)"], 0.00056826125],
                "<pint-us-dry>": [["pt(usd)", "pint(usd)", "pints(usd)"], 0.000550610475],
                "<pint-us-liquid>": [["pt(usl)", "pint(usl)", "pints(usl)"], 0.000473176473],
                "<quart>": [["qt", "quart", "quarts"], 0.00094635295],
                "<quart-uk>": [["qt(uk)", "quart(uk)", "quarts(uk)"], 0.0011365225],
                "<quart-us-dry>": [["qt(usd)", "quart(usd)", "quarts(usd)"], 1.10122095e-3],
                "<quart-us-liquid>": [["qt(usl)", "quart(usl)", "quarts(usl)"], 9.46352946e-4],
                "<tablespoon-metric>": [["tb", "tbs", "tablespoon", "tablespoons"], 0.000015],
                "<tablespoon-uk>": [["tb(uk)", "tbs(uk)", "tablespoon(uk)", "tablespoons(uk)"], 1.420653125e-5],
                "<tablespoon-us>": [["tb(us)", "tbs(us)", "tablespoon(us)", "tablespoons(us)"], 1.478676478125e-5],
                "<teaspoon-metric>": [["tsp", "teaspoon", "teaspoons"], 0.000005],
                "<teaspoon-us>": [["tsp(us)", "teaspoon(us)", "teaspoons(us)"], 4.92892161e-6],
            }
        }
    };
    Quantity.BASE_UNITS = ["<meter>", "<kilogram>", "<second>", "<mole>", "<farad>", "<ampere>", "<radian>", "<kelvin>", "<temp-K>", "<byte>", "<dollar>", "<candela>", "<each>", "<steradian>", "<bel>"];
    Quantity.SIGNATURE_VECTOR = ["length", "time", "temperature", "mass", "current", "substance", "luminosity", "currency", "data", "angle", "capacitance"];
    Quantity.UNITY = "<1>";
    Quantity.UNITY_ARRAY = [Quantity.UNITY];
    Quantity.parsedUnitsCache = {};
    Quantity.baseUnitCache = {};
    Quantity.stringifiedUnitsCache = new utilities_1.NestedMap();
    Quantity.PREFIX_VALUES = {};
    Quantity.PREFIX_MAP = {};
    Quantity.UNIT_VALUES = {};
    Quantity.UNIT_MAP = {};
    Quantity.OUTPUT_MAP = {};
    // Regular expressions
    Quantity.SIGN = "[+-]";
    Quantity.INTEGER = "\\d+";
    Quantity.SIGNED_INTEGER = Quantity.SIGN + "?" + Quantity.INTEGER;
    Quantity.FRACTION = "\\." + Quantity.INTEGER;
    Quantity.FLOAT = "(?:" + Quantity.INTEGER + "(?:" + Quantity.FRACTION + ")?" + ")" + "|" + "(?:" + Quantity.FRACTION + ")";
    Quantity.EXPONENT = "[Ee]" + Quantity.SIGNED_INTEGER;
    Quantity.SCI_NUMBER = "(?:" + Quantity.FLOAT + ")(?:" + Quantity.EXPONENT + ")?";
    Quantity.SIGNED_NUMBER = Quantity.SIGN + "?\\s*" + Quantity.SCI_NUMBER;
    Quantity.QTY_STRING = "(" + Quantity.SIGNED_NUMBER + ")?" + "\\s*([^/]*)(?:\/(.+))?";
    Quantity.QTY_STRING_REGEX = new RegExp("^" + Quantity.QTY_STRING + "$");
    Quantity.POWER_OP = "\\^|\\*{2}";
    Quantity.TOP_REGEX = new RegExp("([^ \\*.]+?)(?:" + Quantity.POWER_OP + ")?(-?\\d+)(?![A-z])");
    Quantity.BOTTOM_REGEX = new RegExp("([^ \\*.]+?)(?:" + Quantity.POWER_OP + ")?(\\d+)");
    Quantity.BOUNDARY_REGEX = "\\b|\\s|$";
    // Numbers for conversion
    Quantity.FIVE_NINTHS = new math_1.Decimal("5").div("9");
    Quantity.NINE_FIFTHS = new math_1.Decimal("9").div("5");
    return Quantity;
}());
exports.Quantity = Quantity;
// Do the static initalisation
Quantity.initialize();
