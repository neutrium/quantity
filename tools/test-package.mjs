import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
assert(args.every(arg => arg === '--skip-build'), 'Usage: test-package.mjs [--skip-build]');

if (!args.includes('--skip-build'))
{
	execFileSync('pnpm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
}

const directory = await mkdtemp(join(tmpdir(), 'quantity-consumer-'));
const run = (command, args, cwd = directory) => execFileSync(command, args, { cwd, stdio: 'inherit' });

try
{
	// Verify exactly the archive that consumers install, without recursively invoking hooks.
	const packed = JSON.parse(execFileSync('pnpm', [
		'--config.ignore-scripts=true', 'pack', '--json', '--pack-destination', directory,
	], { cwd: root, encoding: 'utf8' }));
	const files = packed.files.map(file => file.path);
	assert(files.includes('LICENSE'), 'The package must include LICENSE');
	assert(files.includes('src/parsers/qty-grammar.ne'));
	assert(files.every(file => /^(dist\/|src\/|README\.md$|LICENSE$|package\.json$)/.test(file)),
		'The package must not include tests, benchmarks or development configuration');

	// The fixtures import Math and Decimal directly, so declare both as consumer dependencies.
	const project = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
	// Exercise unpublished sibling Math changes using the exact packed artifact.
	const mathPackage = process.env.NEUTRIUM_MATH_PACKAGE;

	if (mathPackage)
	{
		await writeFile(join(directory, 'pnpm-workspace.yaml'),
			'overrides:\n  "@neutrium/math": ' + JSON.stringify('file:' + resolve(mathPackage)) + '\n');
	}

	await writeFile(join(directory, 'package.json'), JSON.stringify({
		private: true,
		type: 'module',
		packageManager: project.packageManager,
		dependencies: {
			[packed.name]: 'file:./' + basename(packed.filename),
			'@neutrium/math': project.dependencies['@neutrium/math'],
			'@neutrium/decimal': project.dependencies['@neutrium/decimal'],
		},
	}));
	run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts', '--prefer-offline']);
	const math = JSON.parse(await readFile(join(directory, 'node_modules/@neutrium/math/package.json'), 'utf8'));
	assert.equal(math.version, project.dependencies['@neutrium/math'], 'The tested Math artifact must match the declared version');
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

	// CI publishes this exact consumer-tested archive, without packing a second time.
	if (process.env.QUANTITY_PACKAGE_ARTIFACT)
	{
		await cp(packed.filename, process.env.QUANTITY_PACKAGE_ARTIFACT);
	}
}
finally
{
	await rm(directory, { recursive: true, force: true });
}
