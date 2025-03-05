import { typeguards, compareArray } from '@neutrium/utilities';
import { Quantity } from '../Quantity.js';
import { throwIncompatibleUnits } from './errors.js';
import { inverse } from './maths.js';
const UNITY_ARRAY = ["<1>"];
export function eq(a, b) {
    return compareTo(a, b) === 0;
}
export function lt(a, b) {
    return compareTo(a, b) === -1;
}
export function lte(a, b) {
    return eq(a, b) || lt(a, b);
}
export function gt(a, b) {
    return compareTo(a, b) === 1;
}
export function gte(a, b) {
    return eq(a, b) || gt(a, b);
}
// Return true if quantities and units match
// Quantity("100 cm").same(Quantity("100 cm"))  # => true
// Quantity("100 cm").same(Quantity("1 m"))     # => false
export function same(a, b) {
    return a.scalar.eq(b.scalar) && (a.units() === b.units());
}
export function isInverse(a, b) {
    return isCompatible(inverse(a), b);
}
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
export function compareTo(a, b) {
    if (typeguards.isString(b) || typeguards.isNumber(b)) {
        return compareTo(a, new Quantity(b));
    }
    if (!isCompatible(a, b)) {
        throwIncompatibleUnits();
    }
    if (a.baseScalar.lt(b.baseScalar)) {
        return -1;
    }
    else if (a.baseScalar.eq(b.baseScalar)) {
        return 0;
    }
    else if (a.baseScalar.gt(b.baseScalar)) {
        return 1;
    }
}
//
// Check to see if units are compatible, but not the scalar part
// this check is done by comparing signatures for performance reasons
// if passed a string, it will create a unit object with the string and then do the comparison
// this permits a syntax like:
// unit =~ "mm"
// if you want to do a regexp on the unit string do this ...
// unit.units =~ /regexp/
//
export function isCompatible(a, b) {
    if (typeguards.isString(b)) {
        return isCompatible(a, new Quantity(b));
    }
    if (!(b instanceof Quantity)) {
        return false;
    }
    if (b.signature !== undefined) {
        return a.signature === b.signature;
    }
    else {
        return false;
    }
}
// returns true if no associated units
// false, even if the units are "unitless" like 'radians, each, etc'
export function isUnitless(a) {
    return compareArray(a.numerator, UNITY_ARRAY) && compareArray(a.denominator, UNITY_ARRAY);
}
