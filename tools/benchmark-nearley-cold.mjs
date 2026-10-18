import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const testNumeric = new DecimalScientificAdapter();
// Run after npm run build; optional first argument overrides the default report path.
import assert from 'node:assert/strict';
import { measure, measurementDefaults } from '../benchmark/measure.js';
import { writeResults } from '../benchmark/write-results.js';
import { cpus } from 'node:os';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';
import { UnitTokenManager } from '../dist/UnitTokenManager.js';

const manager = UnitTokenManager.instance;
const aliases = [];

for (const prefix of new Set(Object.values(manager.getMap('prefix'))))
{
	for (const [unit, definition] of Object.entries(manager.values))
	{
		if (definition.category === 'prefix' || unit === '<1>' || unit.startsWith('<temp-')) continue;

		aliases.push(manager.getUnitOutput(unit, prefix));

		if (aliases.length === 400) break;
	}

	if (aliases.length === 400) break;
}

const parser = new NearleyParser();
const regex = new RegexParser();
const cases = [
	['simple unit', 'm'], ['compound units', '2 km/s'],
	...[50, 100, 200, 400].map(count => [`${count} distinct terms`, aliases.slice(0, count).join('*')]),
];
const results = {};

for (const [name, input] of cases)
{
	const expected = regex.parse(input, testNumeric);
	const validate = value => {
		assert.equal(value.scalar.toString(), expected.scalar.toString());
		assert.deepEqual(value.numerator, expected.numerator);
		assert.deepEqual(value.denominator, expected.denominator);
	};
	results[name] = {
		characters: input.length,
		microsecondsPerOperation: measure({
			run: () => parser.parse(input, testNumeric),
			beforeEach: () => parser.clearCache(),
			validate,
		}),
	};
}
const report = {
	environment: { node: process.version, platform: process.platform, architecture: process.arch, cpu: cpus()[0].model },
	settings: { ...measurementDefaults, unitExpressionCache: 'cleared before each parse, outside timing' },
	results,
};
writeResults('nearley-cold.json', report, process.argv[2]);
console.table(results);
