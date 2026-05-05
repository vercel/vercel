import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true,
    // Use of process.chdir prohibits usage of the default "threads". https://vitest.dev/config/#forks
    pool: 'forks',
    testTimeout: 12 * 60 * 1000,
    hookTimeout: 12 * 60 * 1000,
    env: {
      // Vitest supresses color output when `process.env.CI` is true
      // so override that behavior
      // Issue: https://github.com/vitest-dev/vitest/issues/2732
      // Fix: https://github.com/JoshuaKGoldberg/expect-no-axe-violations/pull/3/files
      FORCE_COLOR: '1',
    },
    hideSkippedTests: true,
    exclude: [
      // default
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,ava,babel,nyc,cypress,tsup,build}.config.*',
      // some artifacts in the fixtures have spec files that we're not using
      '**/*.spec.js',
    ],
  },
});
