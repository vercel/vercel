import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig } from 'vite';
import {
  WORKERS_PER_SANDBOX,
  testserverBases,
} from './test/testserver/sandbox-pool';

// Standalone config for the Testserver lane (`pnpm test-testserver`).
// Deliberately not merged with the root or CLI config: mergeConfig concatenates
// arrays (include/exclude), and the CLI's setup file and config-validator alias
// exist for in-process `src` imports. These tests only spawn the built CLI.
const sandboxCount = Math.max(1, testserverBases().length);

// Setting `reporters` turns off Vitest's own default choice, so repeat it
// (`agent` when an AI agent runs Vitest, else `default`, plus `github-actions`
// on GitHub) and add the live progress reporter. std-env is the package
// Vitest uses for that detection. In a runner sandbox the environment isn't
// the developer's, so the wrapper passes its own detection as
// TESTSERVER_IS_AGENT=1|0.
async function detectAgent(): Promise<boolean> {
  const given = process.env.TESTSERVER_IS_AGENT;
  if (given === '1' || given === '0') return given === '1';
  const vitestRequire = createRequire(
    createRequire(import.meta.url).resolve('vitest/package.json')
  );
  const { isAgent } = (await import(
    pathToFileURL(vitestRequire.resolve('std-env')).href
  )) as { isAgent: boolean };
  return isAgent;
}
const isAgent = await detectAgent();
const progressReporter = fileURLToPath(
  new URL('./test/testserver/progress-reporter.ts', import.meta.url)
);

export default defineConfig({
  test: {
    globals: true,
    pool: 'forks',
    include: ['test/testserver/**/*.test.ts'],
    globalSetup: ['./test/testserver/global-setup.ts'],
    // No retries. Front retries twice in CI, but Vitest 4.1.10 doesn't re-run a
    // fixture whose setup threw, so retries can't recover the infrastructure
    // failures front retries for. The root config's retry: 3 would also hide
    // the flakiness this lane is meant to measure.
    retry: 0,
    // Front's workers: 4, i.e. at most 4 concurrent test ids per sandbox.
    // Workers map onto sandboxes by VITEST_POOL_ID (test/testserver/sandbox-pool.ts).
    maxWorkers: WORKERS_PER_SANDBOX * sandboxCount,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Skips are the expected local outcome without a sandbox, so show them.
    hideSkippedTests: false,
    reporters: [
      isAgent ? 'agent' : 'default',
      ...(process.env.GITHUB_ACTIONS === 'true' ? ['github-actions'] : []),
      progressReporter,
    ],
    env: { FORCE_COLOR: '0' },
  },
});
