import assert from 'node:assert/strict';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

const cases = [
    ['default', "import { Quantity } from '@neutrium/quantity'; export const result = new Quantity('2 m').add('1 m').scalar.toString();", ['RegexQtyParser'], ['NearleyQtyParser', '/nearley/', '/moo/']],
    ['regex', "import { Quantity } from '@neutrium/quantity/regex'; import { isQuantity } from '@neutrium/quantity/guards.js'; export const result = isQuantity(new Quantity('1e3 m').add('2 m'));", ['NearleyQtyParser', 'qty-grammar', 'MooQtyLexer', '/nearley/', '/moo/'], ['RegexQtyParser']],
    ['custom', "import { createQuantityClass } from '@neutrium/quantity/core'; import { Decimal } from '@neutrium/decimal'; const Quantity = createQuantityClass(() => ({ parse: text => ({ scalar: new Decimal(text), numerator: ['<1>'], denominator: ['<1>'] }) })); export const result = new Quantity('2').add('3').scalar.toString();", ['NearleyQtyParser', 'RegexQtyParser', 'qty-grammar', 'MooQtyLexer', '/nearley/', '/moo/'], []],
];

for (const [name, source, absent, present] of cases) {
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
    assert.equal(bundled.result, name === 'regex' ? true : name === 'default' ? '3' : '5');
    console.log(`${name} bundle passed: ${Buffer.byteLength(chunks[0].code)} bytes; unused parsers absent`);
}
