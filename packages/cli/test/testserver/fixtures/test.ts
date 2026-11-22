import { test as base, expect } from 'vitest';
import type { Factories } from '../factories/types';
import { setupTmpDir } from '../../helpers/setup-unit-fixture';
import { createApi, type Api } from './api';
import { startApiProxy, type ApiProxy } from './api-proxy';
import {
  createArtifactRecorder,
  writeArtifacts,
  type ArtifactRecorder,
} from './artifacts';
import { createAuthenticator, type Authenticator } from './authenticator';
import { createCli, type Cli } from './cli';
import { createLogin, type LoginFixture } from './login';
import { createProgress, secs, type Progress } from './progress';
import { createTestFactories } from './test-factories';
import { createTestServer, type TestServer } from './test-server';
import { pickSandbox, testserverBases } from '../sandbox-pool';

// Vitest port of vercel/front tooling/playwright/src/test/testserver-test.ts.
// Each fixture's logic lives in its own file; this file wires them together.

export interface TestserverFixtures {
  artifacts: ArtifactRecorder;
  progress: Progress;
  testServer: TestServer;
  factories: Factories;
  apiProxy: ApiProxy;
  authenticator: Authenticator;
  login: LoginFixture;
  tmpDir: () => string;
  cli: Cli;
  api: Api;
}

function titlePath(task: {
  name: string;
  suite?: { name: string; suite?: unknown } | undefined;
}): string {
  const names = [task.name];
  let suite = task.suite as { name: string; suite?: unknown } | undefined;
  while (suite) {
    if (suite.name) names.unshift(suite.name);
    suite = suite.suite as { name: string; suite?: unknown } | undefined;
  }
  return names.join(' > ');
}

// Vitest 4.1.10 doesn't re-run a fixture on retry when its setup threw on the
// previous attempt; dependents then receive `undefined`. The lane config uses
// retry: 0, but `--retry` on the command line can still trigger this. Fail
// with a pointer to the original error instead of a TypeError.
function requireTestServer(testServer: TestServer | undefined): TestServer {
  if (!testServer) {
    throw new Error(
      'testServer fixture is not set up; see the error from the first attempt'
    );
  }
  return testServer;
}

export const testserverTest = base.extend<TestserverFixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: fixture with no dependencies
  artifacts: async ({}, use) => {
    await use(createArtifactRecorder());
  },

  // Live progress lines for progress-reporter.ts. Torn down after every
  // fixture that depends on it, so the flush covers all their events.
  progress: async ({ task }, use) => {
    const progress = createProgress(task);
    await use(progress);
    await progress.flush();
  },

  testServer: [
    async ({ artifacts, progress, task, skip, annotate }, use) => {
      const bases = testserverBases();
      if (bases.length === 0) {
        if (process.env.CI) {
          throw new Error(
            'TESTSERVER_BASE is not set; the CI job must create a sandbox'
          );
        }
        return skip(
          'No Testserver sandbox: run `pnpm test-testserver` or set TESTSERVER_BASES (see test/testserver/README.md)'
        );
      }

      const { base, index } = pickSandbox(bases, process.env.VITEST_POOL_ID);
      const sandboxLabel =
        bases.length > 1 ? ` on sandbox ${index + 1}/${bases.length}` : '';
      const startedAt = Date.now();
      progress.log(`creating container${sandboxLabel}…`);
      const server = createTestServer(base);
      await annotate(base, 'testserver[base]');
      // Unlike front, tear down when startup fails: a PUT can create the
      // container and still fail here (timeout, bad body, last retry), which
      // would leave it running on the cached sandbox. DELETE is idempotent.
      try {
        await annotate(server.testId, 'testserver[test-id]');
        await server.start({
          name: titlePath(task),
          file: task.file.name,
          title: task.name,
        });
      } catch (error) {
        await server.end();
        throw error;
      }
      artifacts.phases.containerMs = Date.now() - startedAt;
      progress.log(
        `container ready ${secs(artifacts.phases.containerMs)}${sandboxLabel}`
      );

      try {
        await use({
          base: server.base,
          testId: server.testId,
          fetch: server.fetch,
          warmup: server.warmup,
        });
      } finally {
        const teardownStartedAt = Date.now();
        // Fixture teardown runs before `onTestFailed` hooks, so read the
        // task state directly.
        if (task.result?.state === 'fail') {
          artifacts.testserverLog = await server.fetchLog();
          try {
            writeArtifacts({
              file: task.file.filepath,
              testId: server.testId,
              base: server.base,
              recorder: artifacts,
            });
          } catch (e) {
            console.error('Error writing testserver artifacts:', e);
          }
        }
        await server.end();
        const endedAt = Date.now();
        progress.summary({
          totalMs: endedAt - startedAt,
          teardownMs: endedAt - teardownStartedAt,
          phases: artifacts.phases,
        });
      }
    },
    { auto: true },
  ],

  factories: async ({ testServer, artifacts, progress }, use) => {
    await use(
      createTestFactories(requireTestServer(testServer), artifacts, progress)
    );
  },

  apiProxy: async ({ testServer, artifacts }, use) => {
    const proxy = await startApiProxy(requireTestServer(testServer), artifacts);
    try {
      await use(proxy);
    } finally {
      await proxy.close();
    }
  },

  authenticator: async (
    { testServer, factories, artifacts, progress },
    use
  ) => {
    await use(
      createAuthenticator(
        requireTestServer(testServer),
        factories,
        artifacts.phases,
        progress
      )
    );
  },

  login: async ({ factories, authenticator }, use) => {
    await use(createLogin(factories, authenticator));
  },

  // biome-ignore lint/correctness/noEmptyPattern: fixture with no dependencies
  tmpDir: async ({}, use) => {
    await use(() => setupTmpDir());
  },

  cli: async (
    { apiProxy, authenticator, artifacts, progress, signal },
    use
  ) => {
    await use(
      createCli({ apiProxy, authenticator, artifacts, progress, signal })
    );
  },

  // Explicit types: `Api` is itself callable, which defeats Vitest's
  // contextual typing for fixture functions.
  api: async (
    {
      testServer,
      authenticator,
    }: { testServer: TestServer; authenticator: Authenticator },
    use: (api: Api) => Promise<void>
  ) => {
    await use(createApi(requireTestServer(testServer), authenticator));
  },
});

export { expect };
