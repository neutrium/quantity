import { PREFIXES } from './data/Prefixes.js';
import { UNITS } from './data/Units.js';
export class UnitTokenManager {
    static _instance;
    // Precompile gets rid of PREFIX_MAP and UNIT_MAP - incorrect used for normalising units
    // Maps all the variants for a prefix back to their token
    // It has the same structure as UNIT_MAP
    // Maps are used by the parser
    static PREFIX_MAP = {};
    // Maps all variants used in a unit string back to their token
    // MAPS are only used by the parser
    // {
    //  	gee: "<gee>",
    //		gforce: "<gee>",
    //		gn: "<gee>",
    //	}
    static UNIT_MAP = {};
    // Maps a token to the prefix/unit definition
    // {
    //		<gee>: {
    //			category: "acceleration",
    //			denominator: ["<second>", "<second>"],
    //			numerator: ["<meter>"],
    //			scalar: 9.80665
    //		}
    // }
    static VALUES_MAP = {};
    // Maps a token to the default form of that unit e.g.
    // {
    // 		<radian>: "rad",
    // 		<rev>: "rev",
    // 		<sextant>: "sextant"
    // 	}
    static OUTPUT_MAP = {};
    constructor() { }
    /**
     * The static getter that controls access to the singleton instance.
     *
     * This implementation allows you to extend the Singleton class while
     * keeping just one instance of each subclass around.
     */
    static get instance() {
        if (!UnitTokenManager._instance) {
            const tm = new UnitTokenManager();
            tm.initialize();
            UnitTokenManager._instance = tm;
        }
        return UnitTokenManager._instance;
    }
    initialize() {
        let definition;
        // Process the prefixes file
        for (let prefix in PREFIXES) {
            definition = PREFIXES[prefix];
            UnitTokenManager.VALUES_MAP[prefix] = {
                scalar: definition[1],
                numerator: null,
                denominator: null,
                category: "prefix"
            };
            UnitTokenManager.OUTPUT_MAP[prefix] = definition[0][0];
            for (let i = 0; i < definition[0].length; i++) {
                UnitTokenManager.PREFIX_MAP[definition[0][i]] = prefix;
            }
        }
        for (let categoryDef in UNITS) {
            let category = UNITS[categoryDef];
            for (let unitDef in category.units) {
                definition = category.units[unitDef];
                UnitTokenManager.VALUES_MAP[unitDef] = {
                    scalar: definition[1],
                    numerator: category.numerator,
                    denominator: category.denominator,
                    category: categoryDef
                };
                for (let j = 0; j < definition[0].length; j++) {
                    UnitTokenManager.UNIT_MAP[definition[0][j]] = unitDef;
                }
                // Might not need output map
                UnitTokenManager.OUTPUT_MAP[unitDef] = definition[0][0];
            }
        }
    }
    get values() {
        return UnitTokenManager.VALUES_MAP;
    }
    getPrefixToken(val) {
        return UnitTokenManager.PREFIX_MAP[val] ?? null;
    }
    getUnitToken(val) {
        return UnitTokenManager.UNIT_MAP[val] ?? null;
    }
    getUnit(token) {
        return UnitTokenManager.VALUES_MAP[token];
    }
    getTokenDefaultValue(token) {
        return UnitTokenManager.OUTPUT_MAP[token];
    }
    getMap(type = 'unit') {
        if (type === 'unit') {
            return UnitTokenManager.UNIT_MAP;
        }
        else if (type === 'prefix') {
            return UnitTokenManager.PREFIX_MAP;
        }
    }
}
