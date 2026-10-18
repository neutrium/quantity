import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
import type { Decimal } from '@neutrium/decimal';
import { createQuantityClass } from './factory.js';
import type { Quantity as GenericQuantity } from './QuantityCore.js';
import { NearleyParser } from './parsers/NearleyParser.js';

/**
 * Default preset: Decimal scalars and the Nearley expression parser.
 * Use `withConfig` for Quantity settings or `createQuantityClass` to select another backend/parser.
 * @example
 * ```ts
 * import { Quantity } from '@neutrium/quantity';
 * new Quantity('1 m').add('25 cm').scalar.toString(); // "1.25"
 * ```
 */
export const Quantity = createQuantityClass({
	numeric: Object.freeze(new DecimalScientificAdapter()),
	parser: config => new NearleyParser(config),
});
/** A quantity with the selected scalar representation. */
export type Quantity<T = Decimal, Numeric extends object = T extends Decimal ? import('@neutrium/decimal').DecimalConfig : object> = GenericQuantity<T, Numeric>;
/** Nested Decimal options and optional library cache policies. */
export type QuantityConfigInput = import('./QuantityConfig.js').QuantityConfigInput<import('@neutrium/decimal').DecimalConfigInput>;
export type { QuantityConfig, QuantityCacheInput, QuantityCacheConfig } from './QuantityConfig.js';
export type { CacheConfigInput, CacheConfig } from '@neutrium/utilities/cache';
export type { ParserConfigInput, ParserConfig, ParserCacheConfigInput, ParserCacheStats } from './parsers/ParserConfig.js';
