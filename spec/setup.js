import { afterEach } from 'vitest';
import { Decimal } from '@neutrium/decimal';

const originalConfig = Decimal.config;

afterEach(() => {
	Decimal.config = originalConfig;
});
