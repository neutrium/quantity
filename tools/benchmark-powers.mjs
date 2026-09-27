// Run after npm run build; optional first argument overrides the default report path.
import assert from 'node:assert/strict';
import { Quantity } from '../dist/Quantity.js';
import { Quantity as RegexQuantity } from '../dist/regex.js';
import { measure } from '../benchmark/measure.js';
import { writeResults } from '../benchmark/write-results.js';

const a = new Quantity('2 m'), b = new Quantity('3 m'), c = new Quantity('3 s');
const cases = [
	...[100, 1000, 10000].map(power => [`pow ${power}`, () => new Quantity('1 m').pow(power), '1', `m${power}`]),
	['nearley m10000', () => new Quantity('1 m10000'), '1', 'm10000'],
	['regex m10000', () => new RegexQuantity('1 m10000'), '1', 'm10000'],
	['add quantities', () => a.add(b), '5', 'm'],
	['multiply quantities', () => a.mul(c), '6', 'm*s'],
	['nearley 2 km/h', () => new Quantity('2 km/h'), '2', 'km/h'],
	['regex 2 km/h', () => new RegexQuantity('2 km/h'), '2', 'km/h'],
];

if (process.env.LARGE_POWERS)
{
	cases.push(
		['pow 1000000', () => new Quantity('1 m').pow(1000000), '1', 'm1000000'],
		['nearley m1000000', () => new Quantity('1 m1000000'), '1', 'm1000000'],
		['regex m1000000', () => new RegexQuantity('1 m1000000'), '1', 'm1000000'],
	);
}
const results = {};

for (const [name, run, scalar, units] of cases)
{
	results[name] = measure({
		run,
		validate: result => {
			assert.equal(result.scalar.toString(), scalar);
			assert.equal(result.units(), units);
		},
	});
}
writeResults('powers.json', results, process.argv[2]);
console.table(results);
