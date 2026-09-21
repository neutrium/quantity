// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
// Bypasses TS6133. Allow declared but unused functions.
// @ts-ignore
function id(d) { return d[0]; }
import { Decimal } from '@neutrium/decimal';
import { MooQtyLexer } from './MooQtyLexer.js';
import { UnitTokenManager } from '../UnitTokenManager.js';
const lexer = new MooQtyLexer().lexer;
const tm = UnitTokenManager.instance;
function mdUnits(v1, v2, divide = false) {
    let n2 = divide ? v2.denominator : v2.numerator, d2 = divide ? v2.numerator : v2.denominator;
    return {
        numerator: [...v1.numerator, ...n2],
        denominator: [...v1.denominator, ...d2]
    };
}
function finaliseQty(scalar, numerator, denominator) {
    return {
        scalar: scalar,
        numerator: cleanUnitArray(numerator),
        denominator: cleanUnitArray(denominator)
    };
}
function cleanUnitArray(array) {
    while (array.length > 1) {
        const index = array.indexOf('<1>');
        if (index !== -1) {
            array.splice(index, 1);
        }
        else {
            break;
        }
    }
    return array;
}
function unitsToPower(units, pwrStr) {
    let numerator = units.numerator, denominator = units.denominator;
    const pwr = parseInt(pwrStr);
    if (pwr < 0) {
        numerator = units.denominator;
        denominator = units.numerator;
    }
    const multiplier = Math.abs(pwr);
    return {
        numerator: (new Array(multiplier)).fill(numerator).flat(),
        denominator: (new Array(multiplier)).fill(denominator).flat()
    };
}
;
;
;
;
const grammar = {
    Lexer: lexer,
    ParserRules: [
        { "name": "main$ebnf$1", "symbols": [] },
        { "name": "main$ebnf$1", "symbols": ["main$ebnf$1", (lexer.has("ws") ? { type: "ws" } : ws)], "postprocess": (d) => d[0].concat([d[1]]) },
        { "name": "main", "symbols": ["PWR", "main$ebnf$1", "MD"], "postprocess": (data) => finaliseQty(data[0], data[2].numerator, data[2].denominator) },
        { "name": "main", "symbols": ["MD"], "postprocess": (data) => finaliseQty(new Decimal(1), data[0].numerator, data[0].denominator) },
        { "name": "main", "symbols": ["PWR"], "postprocess": (data) => ({ scalar: data[0], numerator: ['<1>'], denominator: ['<1>'] }) },
        { "name": "PAR", "symbols": [(lexer.has("lParen") ? { type: "lParen" } : lParen), "MD", (lexer.has("rParen") ? { type: "rParen" } : rParen)], "postprocess": (data) => data[1] },
        { "name": "PAR", "symbols": ["UNIT"], "postprocess": (data) => data[0] },
        { "name": "MD$ebnf$1", "symbols": [] },
        { "name": "MD$ebnf$1", "symbols": ["MD$ebnf$1", (lexer.has("ws") ? { type: "ws" } : ws)], "postprocess": (d) => d[0].concat([d[1]]) },
        { "name": "MD$ebnf$2", "symbols": [] },
        { "name": "MD$ebnf$2", "symbols": ["MD$ebnf$2", (lexer.has("ws") ? { type: "ws" } : ws)], "postprocess": (d) => d[0].concat([d[1]]) },
        { "name": "MD", "symbols": ["MD", "MD$ebnf$1", (lexer.has("mul") ? { type: "mul" } : mul), "MD$ebnf$2", "UNIT_PWR"], "postprocess": (data) => mdUnits(data[0], data[4]) },
        { "name": "MD", "symbols": ["MD", (lexer.has("ws") ? { type: "ws" } : ws), "UNIT_PWR"], "postprocess": (data) => mdUnits(data[0], data[2]) },
        { "name": "MD$ebnf$3", "symbols": [] },
        { "name": "MD$ebnf$3", "symbols": ["MD$ebnf$3", (lexer.has("ws") ? { type: "ws" } : ws)], "postprocess": (d) => d[0].concat([d[1]]) },
        { "name": "MD$ebnf$4", "symbols": [] },
        { "name": "MD$ebnf$4", "symbols": ["MD$ebnf$4", (lexer.has("ws") ? { type: "ws" } : ws)], "postprocess": (d) => d[0].concat([d[1]]) },
        { "name": "MD", "symbols": ["MD", "MD$ebnf$3", (lexer.has("div") ? { type: "div" } : div), "MD$ebnf$4", "UNIT_PWR"], "postprocess": (data) => mdUnits(data[0], data[4], true) },
        { "name": "MD", "symbols": ["UNIT_PWR"], "postprocess": id },
        { "name": "UNIT_PWR", "symbols": ["PAR", (lexer.has("pwr") ? { type: "pwr" } : pwr), (lexer.has("integer") ? { type: "integer" } : integer)], "postprocess": (data) => unitsToPower(data[0], data[2].text) },
        { "name": "UNIT_PWR", "symbols": ["PAR", (lexer.has("integer") ? { type: "integer" } : integer)], "postprocess": (data) => unitsToPower(data[0], data[1].text) },
        { "name": "UNIT_PWR", "symbols": ["UNIT"], "postprocess": id },
        { "name": "UNIT", "symbols": [(lexer.has("unit") ? { type: "unit" } : unit), (lexer.has("unit") ? { type: "unit" } : unit)], "postprocess": (data) => ({
                numerator: [tm.getPrefixToken(data[0].value), tm.getUnitToken(data[1].value)],
                denominator: ['<1>']
            }) },
        { "name": "UNIT", "symbols": [(lexer.has("unit") ? { type: "unit" } : unit)], "postprocess": (data) => ({ numerator: [tm.getUnitToken(data[0].value)], denominator: ['<1>'] }) },
        { "name": "PWR", "symbols": ["NUM", (lexer.has("pwr") ? { type: "pwr" } : pwr), "NUM"], "postprocess": (data) => data[0].pow(data[2]) },
        { "name": "PWR", "symbols": ["NUM"], "postprocess": id },
        { "name": "NUM", "symbols": [(lexer.has("signedFloat") ? { type: "signedFloat" } : signedFloat)], "postprocess": (data) => new Decimal(data[0].value) },
        { "name": "NUM", "symbols": [(lexer.has("integer") ? { type: "integer" } : integer)], "postprocess": (data) => new Decimal(data[0].value) }
    ],
    ParserStart: "main",
};
export default grammar;
