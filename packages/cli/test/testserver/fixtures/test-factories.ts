import { createFactories } from '../factories/client';
import type { Factories } from '../factories/types';
import type { PhaseTimings } from '../progress-events';
import type { ArtifactRecorder } from './artifacts';
import { secs, type Progress } from './progress';
import { INFRA_TIMEOUT_MS, type TestServer } from './test-server';

// Port of vercel/front tooling/playwright/src/test/fixtures/test-factories.ts
// plus front's `withFactorySteps` from testserver-test.ts. Vitest has no
// `test.step`, so each `.build` gets a 45s abort signal and errors are
// prefixed with `testserver: seed <path>: ` instead. Each call's time is
// added to the test's seed timing.

function withSeedErrors<T extends object>(
  value: T,
  phases: PhaseTimings,
  progress: Progress,
  path: string[] = []
): T {
  return new Proxy(value, {
    get(target, property, receiver) {
      const child = Reflect.get(target, property, receiver) as unknown;
      const childPath = [...path, String(property)];

      if (typeof child === 'function') {
        if (property === 'external') {
          return (...args: unknown[]) =>
            withSeedErrors(
              Reflect.apply(child, target, args) as object,
              phases,
              progress,
              [`external(${String(args[0])})`]
            );
        }
        return async (...args: unknown[]) => {
          const started = Date.now();
          const label = path.join('.');
          try {
            const result = await Reflect.apply(child, target, args);
            progress.log(`seeded ${label} ${secs(Date.now() - started)}`);
            return result;
          } catch (error) {
            progress.log(
              `✗ seed ${label} failed after ${secs(Date.now() - started)}`
            );
            throw new Error(
              `testserver: seed ${childPath.join('.')}: ${
                error instanceof Error ? error.message : String(error)
              }`,
              { cause: error }
            );
          } finally {
            phases.seedMs += Date.now() - started;
            phases.seedCalls += 1;
          }
        };
      }

      if (child && typeof child === 'object') {
        return withSeedErrors(child, phases, progress, childPath);
      }

      return child;
    },
  });
}

export function createTestFactories(
  testServer: TestServer,
  artifacts: ArtifactRecorder,
  progress: Progress
): Factories {
  const factories = createFactories({
    testserverBase: testServer.base,
    testId: testServer.testId,
    onFactory: f => {
      artifacts.factories.push(f);
    },
    signal: () => AbortSignal.timeout(INFRA_TIMEOUT_MS),
  });
  return withSeedErrors(factories, artifacts.phases, progress);
}
