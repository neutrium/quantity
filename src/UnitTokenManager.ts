import type { CatalogEntry, UnitDefinition } from './data/Catalog.js';
import { LruCache } from './utils/LruCache.js';
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
	private static PREFIX_MAP : KeyValue = Object.create(null);

	// Maps all variants used in a unit string back to their token
	// MAPS are only used by the parser
	// {
	//  	gee: "<gee>",
	//		gforce: "<gee>",
	//		gn: "<gee>",
	//	}
	private static UNIT_MAP : KeyValue = Object.create(null);

	// Maps a token to the prefix/unit definition
	// {
	//		<gee>: {
	//			category: "acceleration",
	//			denominator: ["<second>", "<second>"],
	//			numerator: ["<meter>"],
	//			scalar: 9.80665
	//		}
	// }
	private static VALUES_MAP: Record<string, UnitDefinition> = Object.create(null);

	// Maps a token to the default form of that unit e.g.
	// {
	// 		<radian>: "rad",
	// 		<rev>: "rev",
	// 		<sextant>: "sextant"
	// 	}
	private static OUTPUT_MAP: KeyValue = Object.create(null);
	private static ALIASES: Record<string, string[]> = Object.create(null);
	private static lexicalAliases = new Set<string>();
	private static maxAliasLength = 0;
	private static unitOutputs = new LruCache<string, string>();

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
		let definition: CatalogEntry;

		// Process the prefixes file
		for (let prefix in PREFIXES)
		{
			definition = PREFIXES[prefix];
			UnitTokenManager.ALIASES[prefix] = definition[0];

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
				UnitTokenManager.ALIASES[unitDef] = definition[0];

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

		const aliases = [...Object.keys(UnitTokenManager.PREFIX_MAP), ...Object.keys(UnitTokenManager.UNIT_MAP)];
		UnitTokenManager.lexicalAliases = new Set(aliases);
		UnitTokenManager.maxAliasLength = Math.max(...aliases.map(alias => alias.length));
	}

	// Conservatively retain output spellings that also work with fragment-based lexers.
	private firstAlias(text: string): string | undefined
	{
		for (let length = Math.min(text.length, UnitTokenManager.maxAliasLength); length > 0; length--)
		{
			const alias = text.slice(0, length);
			if (UnitTokenManager.lexicalAliases.has(alias)) return alias;
		}
	}

	/** Choose an output alias that both bundled parsers resolve to this unit/prefix pair. */
	public getUnitOutput(unit: string, prefix?: string): string
	{
		const key = (prefix ?? '') + unit;
		const cached = UnitTokenManager.unitOutputs.get(key);
		if (cached !== undefined) return cached;
		const unitAliases = UnitTokenManager.ALIASES[unit].filter(alias =>
			this.getUnitToken(alias) === unit && !/^[0-9]/.test(alias));
		const prefixes = prefix ? UnitTokenManager.ALIASES[prefix] : [''];
		for (const prefixAlias of prefixes)
		{
			if (prefix && this.getPrefixToken(prefixAlias) !== prefix) continue;
			for (const unitAlias of unitAliases)
			{
				const output = prefixAlias + unitAlias;
				// Avoid exact-alias collisions (m + in = min) and preserve established output spellings.
				if (this.firstAlias(output) !== (prefix ? prefixAlias : unitAlias)) continue;
				UnitTokenManager.unitOutputs.set(key, output);
				return output;
			}
		}
		throw new Error('No unambiguous output alias for ' + key);
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

	public getUnit(token: string): UnitDefinition | undefined
	{
		return UnitTokenManager.VALUES_MAP[token];
	}

	public getTokenDefaultValue(token: string): string | undefined
	{
		return UnitTokenManager.OUTPUT_MAP[token]
	}

	public getMap(type: 'unit' | 'prefix' = 'unit') : KeyValue
	{
		if(type === 'unit')
		{
			return UnitTokenManager.UNIT_MAP;
		}
		return UnitTokenManager.PREFIX_MAP;
	}
}
