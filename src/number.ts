import { createQuantityClass } from './factory.js';
import { NumberAdapter } from '@neutrium/utilities/number';
const numberAdapter = new NumberAdapter();
import { NearleyParser } from './parsers/NearleyParser.js';

/**
 * JavaScript number scalars with Nearley parsing; no Decimal runtime dependency.
 * Use `withConfig` for Quantity settings or `createQuantityClass` to select another backend/parser.
 * @example
 * ```ts
 * import { Quantity } from '@neutrium/quantity/number';
 * new Quantity('2 km').to('m').scalar; // 2000
 * ```
 */
export const Quantity = createQuantityClass({ numeric: numberAdapter, parser: config => new NearleyParser(config) });
/** Instance type with JavaScript number scalars. */
export type Quantity = InstanceType<typeof Quantity>;
export type { QuantityConfigInput, QuantityConfig, QuantityCacheInput, QuantityCacheConfig } from './QuantityConfig.js';