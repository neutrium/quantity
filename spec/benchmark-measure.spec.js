import { expect, it, vi } from 'vitest';
import { measure } from '../benchmark/measure.js';

it.each([false, true])('excludes validation and per-operation setup from timing (setup: %s)', cold => {
	let clock = 0, ready = !cold;
	vi.spyOn(performance, 'now').mockImplementation(() => clock);
	const result = measure({
		beforeEach: cold ? () => { clock += 100; ready = true; } : undefined,
		run: () => {
			expect(ready).toBe(true);
			ready = !cold;
			clock += 2;
			return 42;
		},
		validate: value => { expect(value).toBe(42); clock += 1000; },
	}, { samples: 3, minimumSampleMs: 6, warmupCalls: 1 });
	expect(result).toBe(2000);
});

it('rejects an incorrect measured result even when warmup succeeds', () => {
	let clock = 0, calls = 0;
	vi.spyOn(performance, 'now').mockImplementation(() => clock);
	expect(() => measure({
		run: () => { clock += 2; return ++calls === 1 ? 'correct' : 'incorrect'; },
		validate: value => { if (value !== 'correct') throw new Error('Invalid result'); },
	}, { samples: 1, minimumSampleMs: 6, warmupCalls: 1 })).toThrow('Invalid result');
});
