import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

const noDecimal = ['@neutrium/decimal', '/utilities/dist/decimal/'];
const nearleyModules = ['NearleyParser', '/nearley/', 'qty-grammar'];
const prattModules = ['PrattParser', '/parsing/pratt'];
const expressionParserModules = [...nearleyModules, ...prattModules, 'MooQtyLexer', '/moo/'];
const cases = [
	['number-expressions', "import { Quantity } from '@neutrium/quantity/number'; import { createQuantityEvaluator } from '@neutrium/quantity/expressions'; export const result = createQuantityEvaluator({ Quantity }).evaluate('2 m + 3 m').scalar;", [...noDecimal, 'RegexParser', ...nearleyModules], [...prattModules, '/expressions/engine']],
	['decimal-arithmetic', "import { createQuantityClass } from '@neutrium/quantity/factory'; import { PrattParser } from '@neutrium/quantity/parsers/pratt'; import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic'; const Q = createQuantityClass({ numeric: new DecimalArithmeticAdapter(), parser: c => new PrattParser(c) }); export const result = new Q('25 m2').sqrt().scalar.toString();", ['DecimalScientificAdapter', '/decimal/dist/scientific', '/decimal/dist/ScientificDecimal.js', ...nearleyModules], ['DecimalArithmeticAdapter', ...prattModules]],
	['default', "import { Quantity } from '@neutrium/quantity'; export const result = new Quantity('2 m').add('1 m').scalar.toString();", ['RegexParser', ...nearleyModules], [...prattModules, '/moo/']],
	['regex', "import { Quantity } from '@neutrium/quantity/regex'; import { isQuantity } from '@neutrium/quantity/guards.js'; export const result = isQuantity(new Quantity('1e3 m').add('2 m'));", expressionParserModules, ['RegexParser']],
	['custom', "import { createQuantityClass } from '@neutrium/quantity/factory'; import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific'; const decimalAdapter = new DecimalScientificAdapter(); const Quantity = createQuantityClass({ numeric: decimalAdapter, parser: () => ({ parse: (text, n) => ({ scalar: n.from(text), numerator: [], denominator: [] }) }) }); export const result = new Quantity('2').add('3').scalar.toString();", ['RegexParser', ...expressionParserModules], []],
	['number', "import { Quantity } from '@neutrium/quantity/number'; export const result = new Quantity('2 m').add('3 m').scalar;", [...noDecimal, 'RegexParser', ...nearleyModules], [...prattModules, '/moo/']],
	['number-nearley', "import { createQuantityClass } from '@neutrium/quantity/factory'; import { NumberAdapter } from '@neutrium/math/adapters/number'; import { NearleyParser } from '@neutrium/quantity/parsers/nearley'; const Q = createQuantityClass({ numeric: new NumberAdapter(), parser: c => new NearleyParser(c) }); export const result = new Q('2 (m/s)^2').add('3 m2/s2').scalar;", [...noDecimal, 'RegexParser', ...prattModules], [...nearleyModules, '/moo/']],
	['number-regex', "import { createQuantityClass } from '@neutrium/quantity/factory'; import { NumberAdapter } from '@neutrium/math/adapters/number'; const numberAdapter = new NumberAdapter(); import { RegexParser } from '@neutrium/quantity/parsers/regex'; const Q = createQuantityClass({ numeric: numberAdapter, parser: c => new RegexParser(c) }); export const result = new Q('2 m').add('3 m').scalar;", [...noDecimal, ...expressionParserModules], ['RegexParser']],
	['number-custom-parser', "import { createQuantityClass } from '@neutrium/quantity/factory'; import { NumberAdapter } from '@neutrium/math/adapters/number'; const numberAdapter = new NumberAdapter(); const Q = createQuantityClass({ numeric: numberAdapter, parser: () => ({ parse: (text, n) => ({ scalar: n.from(text), numerator: [], denominator: [] }) }) }); export const result = new Q('2').add('3').scalar;", [...noDecimal, 'RegexParser', ...expressionParserModules], []],
	['number-custom-backend', `
		import { createQuantityClass } from '@neutrium/quantity/factory';
		import { NumberAdapter } from '@neutrium/math/adapters/number'; const numberAdapter = new NumberAdapter();
		import { RegexParser } from '@neutrium/quantity/parsers/regex';
		class Box { constructor(value) { this.value = value; Object.freeze(this); } }
		const value = x => x instanceof Box ? x.value : numberAdapter.from(x);
		const box = x => new Box(x);
		const numeric = {
			id: 'box', tier: 'arithmetic', isValue: x => x instanceof Box,
			from: x => box(value(x)), neg: x => box(-x.value),
			...Object.fromEntries(['add', 'sub', 'mul', 'div', 'rem'].map(op =>
				[op, (a, b) => box(numberAdapter[op](value(a), value(b)))])),
			compare: (a,b) => numberAdapter.compare(value(a), value(b)),
			powInteger: (a, exponent) => box(numberAdapter.powInteger(value(a), exponent)),
			toBytes: () => Infinity,
			toNumber: value, toString: x => String(value(x)),
			isFinite: x => Number.isFinite(value(x)), isNaN: x => Number.isNaN(value(x)), isInteger: x => Number.isInteger(value(x)),
			...Object.fromEntries(['abs', 'floor', 'ceil', 'trunc', 'round'].map(op => [op, x => box(numberAdapter[op](value(x)))])),
		};
		const Q = createQuantityClass({ numeric, parser: c => new RegexParser(c) });
		export const result = new Q('2 m').add('300 cm').scalar.value;
	`, [...noDecimal, ...expressionParserModules], ['RegexParser']],


];

for (const [name, source, absent, present] of cases)
{
	const entry = fileURLToPath(new URL('../tests/bundle-entry.mjs', import.meta.url));
	const result = await build({
		configFile: false, logLevel: 'silent',
		plugins: [{ name: 'quantity-bundle-test', resolveId: id => id === entry ? entry : undefined,
			load: id => id === entry ? source : undefined }],
		build: { write: false, minify: true, lib: { entry, formats: ['es'] } },
	});
	const chunks = (Array.isArray(result) ? result : [result]).flatMap(item => item.output).filter(item => item.type === 'chunk');
	const modules = chunks.flatMap(chunk => Object.keys(chunk.modules));
	for (const fragment of absent) assert(!modules.some(id => id.includes(fragment)), `${name} retains ${fragment}`);
	for (const fragment of present) assert(modules.some(id => id.includes(fragment)), `${name} is missing ${fragment}`);
	assert.equal(chunks.length, 1);
	const bundled = await import(`data:text/javascript;base64,${Buffer.from(chunks[0].code).toString('base64')}`);
	assert.equal(bundled.result, name.startsWith('number') ? 5 : name === 'regex' ? true : name === 'default' ? '3' : '5');
	console.log(`${name} bundle passed: ${Buffer.byteLength(chunks[0].code)} bytes, ${gzipSync(chunks[0].code).length} gzip bytes; dependency checks passed`);
}
