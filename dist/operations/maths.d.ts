import { Decimal } from '@neutrium/decimal';
import { Quantity } from '../Quantity.js';
import { QuantityInitParam } from '../guards.js';
export declare function add(a: Quantity, b_o: QuantityInitParam): Quantity;
export declare function sub(a: Quantity, b_o: QuantityInitParam): Quantity;
export declare function mul(a: Quantity, b_o: QuantityInitParam): Quantity;
export declare function div(a: Quantity, b_o: QuantityInitParam): Quantity;
export declare function pow(a: Quantity, yy: number | string | Decimal): Quantity;
export declare function inverse(a: Quantity): Quantity;
