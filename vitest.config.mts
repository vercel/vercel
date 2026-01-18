import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    // Use of process.chdir prohibits usage of the default "threads". https://vitest.dev/config/#forks
    pool: 'forks',
    // Include both .test.* and .spec.* files
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
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
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      // Fixture directories contain framework test files (Angular, React, etc.) that shouldn't be run by vitest
      '**/fixtures/**',
    ],
  },
});
