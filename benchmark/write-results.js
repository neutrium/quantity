import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Save reports beside the benchmarks, unless an explicit output path is supplied. */
export function writeResults(filename, report, outputPath)
{
	const output = outputPath === undefined
		? fileURLToPath(new URL(`./results/${filename}`, import.meta.url))
		: resolve(outputPath);
	mkdirSync(dirname(output), { recursive: true });
	writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
	console.log(`Benchmark report: ${relative(process.cwd(), output)}`);
}
