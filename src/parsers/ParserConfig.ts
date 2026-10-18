import { CacheScope } from '../utils/CacheScope.js';
import { resolveQuantityCache } from '../QuantityConfig.js';
import { assertKnownKeys } from '@neutrium/utilities/validation';
import { WeakCacheRegistry, cacheConfig, DEFAULT_CACHE_CONFIG, type CacheConfigInput, type BudgetCacheStats } from '@neutrium/utilities/cache';

/** Limits on retained parser plans; zero for either limit disables plan caching. */
export interface ParserCacheConfigInput extends CacheConfigInput {}

/** Options supported by the bundled parsers and passed to custom parser factories. */
export interface ParserConfigInput
{
	/** Retained expression-plan cache limits. */
	cache?: ParserCacheConfigInput;
}

/** Effective, immutable parser settings. */
export interface ParserConfig
{
	/** Fully resolved retained-cache limits. */
	readonly cache: Readonly<Required<ParserCacheConfigInput>>;
}

/** A snapshot of a parser cache's retained plans and configured limits. */
export interface ParserCacheStats extends BudgetCacheStats {}

/** @internal Shared default scope for ordinary parser instances. */
export const DEFAULT_PARSER_CONFIG: ParserConfig = Object.freeze({
	cache: DEFAULT_CACHE_CONFIG,
});
const resolved = new WeakSet<object>([DEFAULT_PARSER_CONFIG]);

/** @internal Snapshot once; parser instances reuse already resolved class settings. */
export function parserConfig(input?: ParserConfigInput, parent: ParserConfig = DEFAULT_PARSER_CONFIG): ParserConfig
{
	if (input === undefined)
	{
		return parent;
	}

	if (resolved.has(input))
	{
		return input as ParserConfig;
	}

	assertKnownKeys(input as unknown, ['cache'], 'parser');
	const result = Object.freeze({ cache: cacheConfig(input.cache, parent.cache, { name: 'parser cache', reuse: true }) });
	resolved.add(result);

	return result;
}

const scopes = new WeakCacheRegistry((config: ParserConfig) => new CacheScope(resolveQuantityCache({ parser: config.cache })));
/** @internal Optional caches used during standalone parser evaluation. */
export function parserScope(config: ParserConfig): CacheScope { return scopes.get(config); }
