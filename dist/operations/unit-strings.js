import { compareArray } from "@neutrium/utilities";
import { UnitTokenManager } from "../UnitTokenManager.js";
// Coalesces an array of units e.g. converts ['s','m','s'] into ['s2','m']
export function simplifyUnits(units) {
    let unitCounts = units.reduce(reduceUnit, []);
    return unitCounts.map(function (unitCount) {
        return unitCount[0] + (unitCount[1] > 1 ? unitCount[1] : "");
    });
}
function reduceUnit(acc, unit) {
    let unitCounter = acc[unit];
    if (!unitCounter) {
        acc.push(unitCounter = acc[unit] = [unit, 0]);
    }
    unitCounter[1]++;
    return acc;
}
//
// Returns a string representing a normalized unit array
//
// @param {string[]} units Normalized unit array
// @returns {string} String representing passed normalized unit array and suitable for output
//
export function stringifyUnits(units) {
    let stringified;
    let isUnity = compareArray(units, ["<1>"]);
    if (isUnity) {
        stringified = "1";
    }
    else {
        stringified = simplifyUnits(getOutputNames(units)).join("*");
    }
    return stringified;
}
export function getOutputNames(units) {
    const tokenMapper = UnitTokenManager.instance;
    let unitNames = [], token, tokenNext;
    for (let i = 0, len = units.length; i < len; i++) {
        token = units[i];
        tokenNext = units[i + 1];
        const unit = tokenMapper.getUnit(token);
        let val = tokenMapper.getTokenDefaultValue(token);
        if (unit.category === 'prefix') {
            val += tokenMapper.getTokenDefaultValue(tokenNext);
            i++;
        }
        unitNames.push(val);
    }
    return unitNames;
}
