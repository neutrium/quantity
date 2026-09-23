import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
assert(args.every(arg => arg === '--skip-build'), 'Usage: test-package.mjs [--skip-build]');

if (!args.includes('--skip-build'))
{
	execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
}

const directory = await mkdtemp(join(tmpdir(), 'quantity-consumer-'));
const run = (command, args, cwd = directory) => execFileSync(command, args, { cwd, stdio: 'inherit' });

try
{
	// Verify exactly the archive that consumers install, without recursively invoking hooks.
	const packed = JSON.parse(execFileSync('npm', [
		'pack', '--ignore-scripts', '--json', '--pack-destination', directory,
	], { cwd: root, encoding: 'utf8' }))[0];
	const files = packed.files.map(file => file.path);
	assert(files.includes('license.txt'));
	assert(files.includes('src/parsers/qty-grammar.ne'));
	assert(files.every(file => /^(dist\/|src\/|README\.md$|license\.txt$|package\.json$)/.test(file)),
		'The package must not include tests, benchmarks or development configuration');

	await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
	run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(directory, packed.filename)]);
	const installed = join(directory, 'node_modules/@neutrium/quantity');
	const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));

	for (const entry of Object.values(manifest.exports))
	{
		for (const path of Object.values(entry))
		{
			assert((await stat(join(installed, path))).isFile(), `Missing exported file: ${path}`);
		}
	}

	assert((await stat(join(installed, manifest.types))).isFile());

	for (const file of ['consumer.mjs', 'consumer.ts'])
	{
		await cp(join(root, 'tests/fixtures', file), join(directory, file));
	}
	run(process.execPath, ['consumer.mjs']);

	for (const moduleResolution of ['NodeNext', 'Bundler'])
	{
		await writeFile(join(directory, 'tsconfig.json'), JSON.stringify({
			compilerOptions: {
				strict: true, noEmit: true, skipLibCheck: false, target: 'ES2022',
				module: moduleResolution === 'NodeNext' ? 'NodeNext' : 'ESNext',
				moduleResolution,
			},
			files: ['consumer.ts'],
		}));
		run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json']);
		console.log(`Packed consumer declarations passed: ${moduleResolution}`);
	}
}
finally
{
	await rm(directory, { recursive: true, force: true });
}
