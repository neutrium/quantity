import { PREFIXES } from './data/Prefixes.js'
import { UNITS } from './data/Units.js'

type KeyValue  = {[key: string]: string}

export class UnitTokenManager
{
	private static _instance: UnitTokenManager;

	// Precompile gets rid of PREFIX_MAP and UNIT_MAP - incorrect used for normalising units


	// Maps all the variants for a prefix back to their token
	// It has the same structure as UNIT_MAP
	// Maps are used by the parser
	private static PREFIX_MAP : KeyValue = {};

	// Maps all variants used in a unit string back to their token
	// MAPS are only used by the parser
	// {
	//  	gee: "<gee>",
	//		gforce: "<gee>",
	//		gn: "<gee>",
	//	}
	private static UNIT_MAP : KeyValue = {};

	// Maps a token to the prefix/unit definition
	// {
	//		<gee>: {
	//			category: "acceleration",
	//			denominator: ["<second>", "<second>"],
	//			numerator: ["<meter>"],
	//			scalar: 9.80665
	//		}
	// }
	private static VALUES_MAP = {};

	// Maps a token to the default form of that unit e.g.
	// {
	// 		<radian>: "rad",
	// 		<rev>: "rev",
	// 		<sextant>: "sextant"
	// 	}
	private static OUTPUT_MAP = {};

	private constructor() { }

	/**
	 * The static getter that controls access to the singleton instance.
	 *
	 * This implementation allows you to extend the Singleton class while
	 * keeping just one instance of each subclass around.
	 */
	public static get instance(): UnitTokenManager
	{
		if (!UnitTokenManager._instance)
		{
			const tm = new UnitTokenManager();
			tm.initialize();

			UnitTokenManager._instance = tm;
		}

		return UnitTokenManager._instance;
	}

	private initialize()
	{
		let definition : [string[], number];

		// Process the prefixes file
		for (let prefix in PREFIXES)
		{
			definition = PREFIXES[prefix];

			UnitTokenManager.VALUES_MAP[prefix] = {
				scalar: definition[1],
				numerator: null,
				denominator: null,
				category: "prefix"
			};
			UnitTokenManager.OUTPUT_MAP[prefix] = definition[0][0];

			for (let i = 0; i < definition[0].length; i++)
			{
				UnitTokenManager.PREFIX_MAP[definition[0][i]] = prefix;
			}
		}

		for (let categoryDef in UNITS)
		{
			let category = UNITS[categoryDef];

			for (let unitDef in category.units)
			{
				definition = category.units[unitDef];

				UnitTokenManager.VALUES_MAP[unitDef] = {
					scalar: definition[1],
					numerator: category.numerator,
					denominator: category.denominator,
					category: categoryDef
				};

				for (let j = 0; j < definition[0].length; j++)
				{
					UnitTokenManager.UNIT_MAP[definition[0][j]] = unitDef;
				}

				// Might not need output map
				UnitTokenManager.OUTPUT_MAP[unitDef] = definition[0][0];
			}
		}
	}

	public get values()
	{
		return UnitTokenManager.VALUES_MAP;
	}

	public getPrefixToken(val: string) : (string | null)
	{
		return UnitTokenManager.PREFIX_MAP[val] ?? null;
	}

	public getUnitToken(val: string) : (string | null)
	{
		return UnitTokenManager.UNIT_MAP[val] ?? null;
	}

	public getUnit(token: string)
	{
		return UnitTokenManager.VALUES_MAP[token];
	}

	public getTokenDefaultValue(token: string)
	{
		return UnitTokenManager.OUTPUT_MAP[token]
	}

	public getMap(type: 'unit' | 'prefix' = 'unit') : KeyValue
	{
		if(type === 'unit')
		{
			return UnitTokenManager.UNIT_MAP;
		}
		else if(type === 'prefix')
		{
			return UnitTokenManager.PREFIX_MAP;
		}
	}
}