// Run after pnpm run build. Optional first argument selects the JSON report path.
import assert from 'node:assert/strict';
import { cpus } from 'node:os';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { RegexParser, NearleyParser, PrattParser } from '../dist/parsers/index.js';
import { measure, measurementDefaults } from '../benchmark/measure.js';
import { writeResults } from '../benchmark/write-results.js';

const parsers = [RegexParser, NearleyParser, PrattParser];
const workloads = [
	['simple unit', 'm'],
	['compound units', '3.5 kg.m/s^2'],
	['50 unit factors', Array(50).fill('kg*m/s^2').join('*')],
	['grouped expression', '1.3e-2 (kg.s)^2', true],
	['scalar arithmetic and Unicode', '3/2 (kg·m/s)²', true],
];
const results = {};
for (const [backend, numeric] of [['Decimal', new DecimalScientificAdapter()], ['number', new NumberAdapter()]])
{
	for (const [name, input, expressionOnly] of workloads)
	{
		const expected = new NearleyParser().parse(input, numeric);
		const validate = actual => assert.deepEqual(actual, expected);

		for (const mode of ['warm plan', 'cold plan', 'caches disabled'])
		{
			const row = results[`${backend}: ${name}: ${mode}`] = {};
			for (const Parser of expressionOnly ? [NearleyParser, PrattParser] : parsers)
			{
				const parser = new Parser({ cache: { maxEntries: mode === 'caches disabled' ? 0 : 1024 } });
				row[Parser.name] = measure({
					run: () => parser.parse(input, numeric), validate,
					...(mode === 'cold plan' ? { beforeEach: () => parser.clearCache() } : {}),
				});
			}
			console.log(`${backend}: ${name}: ${mode}`, row);
		}
	}

	const inputs = Array.from({ length: 2048 }, (_, i) => `${i + 1} kg*m/s^2`);
	const row = results[`${backend}: changing scalars: warm plan`] = {};

	for (const Parser of parsers)
	{
		const parser = new Parser({});
		let cursor = 0, last = 0;
		row[Parser.name] = measure({
			run: () => { last = cursor++ % inputs.length; return parser.parse(inputs[last], numeric); },
			validate: value => assert.deepEqual(value, new NearleyParser().parse(inputs[last], numeric)),
		});
	}
}

writeResults('parsers-comparison.json', {
	environment: { node: process.version, platform: process.platform, architecture: process.arch, cpu: cpus()[0].model },
	settings: { ...measurementDefaults, units: 'median microseconds per operation',
		coldPlan: 'expression cache cleared before each operation outside timing; token caches remain warm',
		warmPlan: 'reused instance and retained plan; scalars evaluated on every call',
		cachesDisabled: 'expression and token caches disabled',
		validation: 'definitions compared with Nearley outside timing; Regex omitted for unsupported syntax' },
	results,
}, process.argv[2]);

console.table(results);
