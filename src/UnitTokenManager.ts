import { CacheScope, defaultCacheScope } from './utils/CacheScope.js';
import type { CatalogEntry, UnitDefinition } from './data/Catalog.js';
import type { UnitPower } from './QuantityDefinition.js';
import { LruCache } from '@neutrium/utilities/cache';
import { PREFIXES } from './data/Prefixes.js'
import { UNITS } from './data/Units.js'

type KeyValue  = {[key: string]: string}
const unprefixedAliases = Object.freeze(['']);
const emptyDimensions: readonly UnitPower[] = Object.freeze([]);

/** Count trusted catalog tokens once per category, preserving their first occurrence. */
function countDimensions(tokens: readonly string[] | undefined): readonly UnitPower[]
{
	if (!tokens?.length)
	{
		return emptyDimensions;
	}

	const counts = new Map<string, number>();

	for (const unit of tokens)
	{
		if (unit !== '<1>')
		{
			counts.set(unit, (counts.get(unit) ?? 0) + 1);
		}
	}

	return counts.size ? Object.freeze(Array.from(counts, ([unit, exponent]) => Object.freeze({ unit, exponent })))
		: emptyDimensions;
}

export class UnitTokenManager
{
	private static _instance: UnitTokenManager;

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
	//			denominator: [{ unit: "<second>", exponent: 2 }],
	//			numerator: [{ unit: "<meter>", exponent: 1 }],
	//			scalar: 9.80665
	//		}
	// }
	private static VALUES_MAP: Record<string, UnitDefinition> = Object.create(null);

	private static ALIASES: Record<string, string[]> = Object.create(null);
	private static lexicalAliases = new Set<string>();
	private static maxAliasLength = 0;
	private static unitOutputsKey = Symbol();

	private constructor() { }

	/** Shared catalog token lookup. */
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
				numerator: emptyDimensions,
				denominator: emptyDimensions,
				category: "prefix"
			};

			for (let i = 0; i < definition[0].length; i++)
			{
				UnitTokenManager.PREFIX_MAP[definition[0][i]] = prefix;
			}
		}

		for (let categoryDef in UNITS)
		{
			let category = UNITS[categoryDef];
			const numerator = countDimensions(category.numerator), denominator = countDimensions(category.denominator);

			for (let unitDef in category.units)
			{
				definition = category.units[unitDef];
				UnitTokenManager.ALIASES[unitDef] = definition[0];

				UnitTokenManager.VALUES_MAP[unitDef] = {
					scalar: definition[1],
					numerator,
					denominator,
					category: categoryDef
				};

				for (let j = 0; j < definition[0].length; j++)
				{
					UnitTokenManager.UNIT_MAP[definition[0][j]] = unitDef;
				}

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
	public getUnitOutput(unit: string, prefix?: string, scope: CacheScope = defaultCacheScope): string
	{
		const outputs = scope.get('metadata', UnitTokenManager.unitOutputsKey, () => new LruCache<string, string>());
		const key = (prefix ?? '') + unit;
		const cached = outputs?.get(key);

		if (cached !== undefined)
		{
			return cached;
		}

		const unitAliases = UnitTokenManager.ALIASES[unit];
		const prefixes = prefix ? UnitTokenManager.ALIASES[prefix] : unprefixedAliases;

		for (const prefixAlias of prefixes)
		{
			if (prefix && this.getPrefixToken(prefixAlias) !== prefix)
			{
				continue;
			}

			for (const unitAlias of unitAliases)
			{
				if (this.getUnitToken(unitAlias) !== unit || /^[0-9]/.test(unitAlias)) continue;

				const output = prefixAlias + unitAlias;

				// Avoid exact-alias collisions (m + in = min) and preserve established output spellings.
				if (this.firstAlias(output) !== (prefix ? prefixAlias : unitAlias)) continue;

				outputs?.set(key, output);

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

	public getMap(type: 'unit' | 'prefix' = 'unit') : KeyValue
	{
		if(type === 'unit')
		{
			return UnitTokenManager.UNIT_MAP;
		}

		return UnitTokenManager.PREFIX_MAP;
	}
}
