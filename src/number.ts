import { createQuantityClass } from './factory.js';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { PrattParser } from './parsers/PrattParser.js';

/**
 * JavaScript number scalars with the default Pratt expression parser.
 * Use `withConfig` for Quantity settings or `createQuantityClass` to select another backend/parser.
 * @example
 * ```ts
 * import { Quantity } from '@neutrium/quantity/number';
 * new Quantity('2 km').to('m').scalar; // 2000
 * ```
 */
export const Quantity = createQuantityClass({
	numeric: Object.freeze(new NumberAdapter()),
	parser: config => new PrattParser(config),
});
/** Instance type with JavaScript number scalars. */
export type Quantity = InstanceType<typeof Quantity>;
export type { QuantityConfigInput, QuantityConfig, QuantityCacheInput, QuantityCacheConfig } from './QuantityConfig.js';
export type { RationalExponent, UnitExponent } from './QuantityDefinition.js';
