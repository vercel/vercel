import { defineConfig } from 'vite';
import VitestReporter from './test/lib/vitest-reporter';

export default defineConfig({
  test: {
    reporters: [new VitestReporter()],
    // Use of process.chdir prohibits usage of the default "threads". https://vitest.dev/config/#forks
    pool: 'forks',
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
      // some artifacts in the fixtures have spec files that we're not using
      '**/*.spec.js',
    ],
  },
});
