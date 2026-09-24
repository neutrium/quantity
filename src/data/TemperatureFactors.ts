import { Decimal } from '@neutrium/decimal';

// Keep registry factors and temperature operations consistent. Computing these
// ratios as JavaScript numbers loses precision before Decimal sees the values.
export const FIVE_NINTHS = new Decimal(5).div(9);
export const NINE_FIFTHS = new Decimal(9).div(5);
