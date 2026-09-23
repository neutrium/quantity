import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Measure native compiled ESM without Vite's import-getter instrumentation.
        experimental: { viteModuleRunner: false, nodeLoader: false },
        benchmark: { include: ['benchmark/**/*.bench.js'] },
        fileParallelism: false,
        maxWorkers: 1,
        testTimeout: 120_000,
        reporters: ['default', './benchmark/reporter.js'],
    },
});
