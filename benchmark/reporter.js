import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, release } from 'node:os';
import { options } from './helpers.js';

export default class BenchmarkReporter
{
	results = [];

	onTestCaseBenchmark(testCase, benchmark)
	{
		this.results.push({ test: testCase.fullName, ...benchmark });
	}

	onTestRunEnd(_modules, errors, reason)
	{
		let commit = null;

		try
		{
			commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
		}
		catch
		{
			/* Benchmarks also work from source archives without Git metadata. */
		}

		const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
		const report = {
			timestamp: new Date().toISOString(),
			packageVersion: manifest.version,
			commit,
			node: process.version,
			v8: process.versions.v8,
			platform: process.platform,
			arch: process.arch,
			osRelease: release(),
			cpu: cpus()[0]?.model,
			logicalCpus: cpus().length,
			options,
			outcome: reason,
			unhandledErrors: errors.map(error => ({ name: error.name, message: error.message })),
			results: this.results,
		};
		const directory = new URL('./results/', import.meta.url);
		mkdirSync(directory, { recursive: true });
		writeFileSync(new URL('vitest.json', directory), JSON.stringify(report, null, 2) + '\n');
		console.log('Benchmark report: benchmark/results/vitest.json');
	}
}
