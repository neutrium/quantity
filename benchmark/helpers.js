import assert from 'node:assert/strict';

function duration(name, fallback)
{
	const value = Number(process.env[name] ?? fallback);
	assert(Number.isFinite(value) && value > 0, `${name} must be a positive number of milliseconds`);
	return value;
}

export const options = {
	time: duration('BENCH_TIME_MS', 500),
	warmupTime: duration('BENCH_WARMUP_MS', 250),
	iterations: 64,
	warmupIterations: 64,
};

// Validate before timing and consume the final measured result afterwards.
// Setup hooks run outside the measured callback; each case retains only one result.
export async function compare(bench, cases)
{
	for (const entry of cases)
	{
		entry.setup?.();
		entry.validate(entry.run());
	}

	const registrations = cases.map(entry => bench(entry.name, {
		beforeEach: entry.setup,
	}, () => { entry.result = entry.run(); }));

	if (registrations.length === 1)
	{
		await registrations[0].run(options);
	}
	else
	{
		await bench.compare(...registrations, options);
	}

	for (const entry of cases)
	{
		entry.validate(entry.result);
	}
}
