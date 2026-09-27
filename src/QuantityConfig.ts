import type { DecimalConfigInput } from '@neutrium/decimal';
import type { ParserConfigInput } from './parsers/ParserConfig.js';
import type { CacheConfigInput } from './utils/CacheConfig.js';
export type { CacheConfigInput, CacheConfig } from './utils/CacheConfig.js';

/** Numerical settings and parser options accepted together by Quantity.withConfig(). */
export interface QuantityConfigInput extends DecimalConfigInput
{
	/** Parser options merged with the parent class's settings. */
	parser?: ParserConfigInput;
	/** Limits applied separately to each instance's expression and result conversion caches. */
	conversionCache?: CacheConfigInput;
}
