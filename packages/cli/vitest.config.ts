/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    // Use of process.chdir prohibits usage of the default "threads". https://vitest.dev/config/#forks
    pool: 'forks',
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
