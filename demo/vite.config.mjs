import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
	root: fileURLToPath(new URL('.', import.meta.url)),
	base: '/quantity/demo/',
	build: {
		outDir: fileURLToPath(new URL('../docs/demo', import.meta.url)),
		emptyOutDir: true,
	},
});
