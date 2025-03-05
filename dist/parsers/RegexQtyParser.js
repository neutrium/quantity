import { Decimal } from "@neutrium/math";
import { UnitTokenManager } from '../UnitTokenManager.js';
export class RegexQtyParser {
    static parsedUnitsCache = {};
    tokenMapper;
    static UNITY = "<1>";
    // REGEX - Numbers
    static SIGN = "[+-]";
    static INTEGER = "\\d+";
    static SIGNED_INTEGER = RegexQtyParser.SIGN + "?" + RegexQtyParser.INTEGER;
    static FRACTION = "\\." + RegexQtyParser.INTEGER;
    static FLOAT = "(?:" + RegexQtyParser.INTEGER + "(?:" + RegexQtyParser.FRACTION + ")?" + ")" + "|" + "(?:" + RegexQtyParser.FRACTION + ")";
    static EXPONENT = "[Ee]" + RegexQtyParser.SIGNED_INTEGER;
    static SCI_NUMBER = "(?:" + RegexQtyParser.FLOAT + ")(?:" + RegexQtyParser.EXPONENT + ")?";
    // Note below could be replaced by "[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?"
    static SIGNED_NUMBER = RegexQtyParser.SIGN + "?\\s*" + RegexQtyParser.SCI_NUMBER;
    // REGEX - Quantity strings e.g. "2.5 m/s^2"
    static QTY_STRING = "(" + RegexQtyParser.SIGNED_NUMBER + ")?" + "\\s*([^/]*)(?:\/(.+))?";
    static QTY_STRING_REGEX = new RegExp("^" + RegexQtyParser.QTY_STRING + "$");
    static POWER_OP = "\\^|\\*{2}";
    static TOP_REGEX = new RegExp("([^ \\*.]+?)(?:" + RegexQtyParser.POWER_OP + ")?(-?\\d+)(?![A-z])");
    static BOTTOM_REGEX = new RegExp("([^ \\*.]+?)(?:" + RegexQtyParser.POWER_OP + ")?(\\d+)");
    static BOUNDARY_REGEX = "\\b|\\s|$";
    // REGEX - defined during module initalisation
    static PREFIX_REGEX;
    static UNIT_REGEX;
    static UNIT_MATCH;
    static UNIT_MATCH_REGEX;
    static UNIT_TEST_REGEX;
    constructor() {
        this.tokenMapper = UnitTokenManager.instance;
        this.initialize();
    }
    initialize() {
        // Look at preprocessing the below
        // Each prefix definition ordered by length eg E|EI|...
        RegexQtyParser.PREFIX_REGEX = Object.keys(this.tokenMapper.getMap('prefix')).sort(function (a, b) {
            return b.length - a.length;
        }).join("|");
        RegexQtyParser.UNIT_REGEX = Object.keys(this.tokenMapper.getMap('unit')).sort(function (a, b) {
            return b.length - a.length;
        }).join("|").replace(/(\(|\))/g, '\\$1');
        // Minimal boundary regex to support units with Unicode characters. \b only works for ASCII
        RegexQtyParser.UNIT_MATCH = "(" + RegexQtyParser.PREFIX_REGEX + ")??(" + RegexQtyParser.UNIT_REGEX + ")(?:" + RegexQtyParser.BOUNDARY_REGEX + ")";
        RegexQtyParser.UNIT_MATCH_REGEX = new RegExp(RegexQtyParser.UNIT_MATCH, "g"); // g flag for multiple occurences
        RegexQtyParser.UNIT_TEST_REGEX = new RegExp("^\\s*(" + RegexQtyParser.UNIT_MATCH + "\\s*(\\.?|\\*?)\\s*)+$"); // Try also to get . as in kg.s as kg*s
    }
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
    parse(val) {
        let output = {
            scalar: new Decimal(1),
            numerator: [RegexQtyParser.UNITY],
            denominator: [RegexQtyParser.UNITY]
        };
        val = (val + '').trim();
        if (val.length === 0) {
            throw new Error("Unit not recognized");
        }
        let result = RegexQtyParser.QTY_STRING_REGEX.exec(val);
        if (!result) {
            throw new Error(val + ": Quantity not recognized");
        }
        let scalarMatch = result[1];
        if (scalarMatch) {
            // Allow whitespaces between sign and scalar for loose parsing
            scalarMatch = scalarMatch.replace(/\s/g, "");
            output.scalar = new Decimal(scalarMatch);
        }
        let top = result[2], bottom = result[3], n, x, nx;
        while ((result = RegexQtyParser.TOP_REGEX.exec(top))) {
            n = parseFloat(result[2]);
            if (isNaN(n)) {
                // Prevents infinite loops
                throw new Error("Unit exponent is not a number");
            }
            // Disallow unrecognized unit even if exponent is 0
            if (n === 0 && !RegexQtyParser.UNIT_TEST_REGEX.test(result[1])) {
                throw new Error("Unit not recognized");
            }
            x = result[1] + " ";
            nx = "";
            for (let i = 0; i < Math.abs(n); i++) {
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
        while ((result = RegexQtyParser.BOTTOM_REGEX.exec(bottom))) {
            n = parseFloat(result[2]);
            if (isNaN(n)) {
                // Prevents infinite loops
                throw new Error("Unit exponent is not a number");
            }
            // Disallow unrecognized unit even if exponent is 0
            if (n === 0 && !RegexQtyParser.UNIT_TEST_REGEX.test(result[1])) {
                throw new Error("Unit not recognized");
            }
            x = result[1] + " ";
            nx = "";
            for (let j = 0; j < n; j++) {
                nx += x;
            }
            bottom = bottom.replace(result[0], nx);
        }
        if (top) {
            output.numerator = this.parseUnits(top.trim());
        }
        if (bottom) {
            output.denominator = this.parseUnits(bottom.trim());
        }
        return output;
    }
    //
    // Parses and converts units string to normalized array of unit tokens.
    // Result is cached to speed up next calls.
    //
    // @param {string} units Units string
    // @returns {string[]} Array of normalized units
    //
    // @example
    // // Returns ["<second>", "<meter>", "<second>"]
    // parseUnits("s m s");
    //
    parseUnits(units) {
        let cacheKey = units, cached = RegexQtyParser.parsedUnitsCache[units], unitMatch, normalizedUnits = [];
        if (cached) {
            return cached;
        }
        // Strip out
        units = units.replace(/(\.|\*)/g, ' ');
        // Scan
        if (!RegexQtyParser.UNIT_TEST_REGEX.test(units)) {
            throw new Error("Unit not recognized");
        }
        while ((unitMatch = RegexQtyParser.UNIT_MATCH_REGEX.exec(units))) {
            normalizedUnits.push(unitMatch.slice(1));
        }
        const parser = this;
        normalizedUnits = normalizedUnits.map(function (item) {
            // Convert multiple forms of a given unit to mutliple occurances of the same token
            const result = [parser.tokenMapper.getPrefixToken(item[0]), parser.tokenMapper.getUnitToken(item[1])];
            // Filter null values and empty strings
            return result.filter((x) => x);
        });
        // Flatten and remove null elements
        normalizedUnits = normalizedUnits.reduce(function (a, b) {
            return a.concat(b);
        }, []);
        RegexQtyParser.parsedUnitsCache[cacheKey] = normalizedUnits;
        return normalizedUnits;
    }
}
