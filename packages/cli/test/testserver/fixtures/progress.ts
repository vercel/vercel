import { recordArtifact, type RunnerTestCase } from 'vitest';
import {
  PHASE_ARTIFACT,
  type ProgressSummary,
  type TestserverPhaseArtifact,
} from '../progress-events';

// Sends live progress lines for one test to progress-reporter.ts.

export interface Progress {
  log: (message: string) => void;
  summary: (summary: ProgressSummary) => void;
  /** Wait until every event has reached the main process. */
  flush: () => Promise<void>;
}

export const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function createProgress(task: Readonly<RunnerTestCase>): Progress {
  const worker = process.env.VITEST_POOL_ID ?? '?';
  // Chain sends so events arrive in order. Progress is best-effort, so a
  // failed send never fails the test.
  let chain: Promise<unknown> = Promise.resolve();
  const send = (fields: Omit<TestserverPhaseArtifact, 'type' | 'worker'>) => {
    chain = chain
      .then(() =>
        recordArtifact(task as RunnerTestCase, {
          type: PHASE_ARTIFACT,
          worker,
          ...fields,
        })
      )
      .catch(() => {});
  };

  return {
    log: message => send({ message }),
    summary: summary => send({ summary }),
    flush: async () => {
      await chain;
    },
  };
}
