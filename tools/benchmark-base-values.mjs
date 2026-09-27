// Run after npm run build; optional first argument overrides the default report path.
import assert from 'node:assert/strict';
import { measure } from '../benchmark/measure.js';
import { writeResults } from '../benchmark/write-results.js';
import { Quantity } from '../dist/Quantity.js';
import { Quantity as RegexQuantity } from '../dist/regex.js';

const metre = new Quantity('2 m');
const kilometre = new Quantity('2 km');
const capacitance = new Quantity('2 farad');
const temperature = new Quantity('32 tempF');
const cases = [
	['copy base quantity', () => new Quantity(metre), '2', '2'],
	['copy scaled quantity', () => new Quantity(kilometre), '2', '2000'],
	['copy derived quantity', () => new Quantity(capacitance), '2', '2'],
	['copy temperature', () => new Quantity(temperature), '32', '273.15'],
	['multiply scaled scalar', () => kilometre.mul(2), '4', '4000'],
	['clone scaled quantity', () => kilometre.clone(), '2', '2000'],
	['explicit toBase', () => kilometre.toBase(), '2000', '2000'],
	['Nearley expression', () => new Quantity('2 km'), '2', '2000'],
	['Regex expression', () => new RegexQuantity('2 km'), '2', '2000'],
	['Fahrenheit interval construction', () => new Quantity('1 degF'), '1', new Quantity('1 degF').baseScalar.toString()],
	['Fahrenheit temperature construction', () => new Quantity('1 tempF'), '1', new Quantity('1 tempF').baseScalar.toString()],
	['large power construction', () => new Quantity('1 ft10000'), '1', new Quantity('1 ft10000').baseScalar.toString()],
];
const results = {};

for (const [name, run, scalar, base] of cases)
{
	results[name] = measure({
		run,
		validate: result => {
			assert.equal(result.scalar.toString(), scalar);
			assert.equal(result.baseScalar.toString(), base);
		},
	}, { warmupCalls: 1000 });
}
writeResults('base-values.json', results, process.argv[2]);
console.table(results);
