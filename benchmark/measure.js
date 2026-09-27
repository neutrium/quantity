export const measurementDefaults = Object.freeze({
	samples: 5,
	minimumSampleMs: 200,
	warmupCalls: 20,
});

// Standalone benchmarks report median microseconds per operation. Vitest's
// statistical benchmarks retain their separate runner and reporting format.
export function measure({ run, validate, beforeEach }, options = {})
{
	const { samples, minimumSampleMs, warmupCalls } = { ...measurementDefaults, ...options };
	let result;

	for (let i = 0; i < warmupCalls; i++)
	{
		beforeEach?.();
		result = run();
	}

	validate(result);

	const timings = [];

	for (let sample = 0; sample < samples; sample++)
	{
		let elapsed = 0, iterations = 0;

		if (beforeEach)
		{
			// Cold workloads prepare each operation outside its timer.
			do
			{
				beforeEach();
				const start = performance.now();
				result = run();
				elapsed += performance.now() - start;
				iterations++;
			} while (elapsed < minimumSampleMs);
		}
		else
		{
			// Warm workloads time the whole batch to minimize timer overhead.
			const start = performance.now();

			do
			{
				result = run();
				iterations++;
				elapsed = performance.now() - start;
			} while (elapsed < minimumSampleMs);
		}

		timings.push(elapsed * 1000 / iterations);
		validate(result);
	}

	timings.sort((a, b) => a - b);
	const middle = Math.floor(timings.length / 2);

	return timings.length % 2 ? timings[middle] : (timings[middle - 1] + timings[middle]) / 2;
}
