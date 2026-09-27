import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Serve the complete generated site under its GitHub Pages path so that
// TypeDoc navigation and the demo's asset URLs work unchanged.
export default defineConfig({
	base: '/quantity/',
	appType: 'mpa',
	build: {
		outDir: fileURLToPath(new URL('../docs', import.meta.url)),
	},
	preview: {
		host: '127.0.0.1',
		port: 4173,
		strictPort: true,
	},
});
