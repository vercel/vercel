import type { TestArtifactBase } from 'vitest';

// Live progress events sent from test fixtures (worker processes) to
// progress-reporter.ts (main process) with Vitest's `recordArtifact`, which
// delivers each event immediately instead of at the end of the test.

export const PHASE_ARTIFACT = 'testserver:phase';

/** Where a test's time goes. */
export interface PhaseTimings {
  containerMs: number;
  seedMs: number;
  seedCalls: number;
  authMs: number;
  cliMs: number;
  cliRuns: number;
}

export interface ProgressSummary {
  totalMs: number;
  teardownMs: number;
  phases: PhaseTimings;
}

export interface TestserverPhaseArtifact extends TestArtifactBase {
  type: typeof PHASE_ARTIFACT;
  /** `VITEST_POOL_ID` of the worker running the test. */
  worker: string;
  /** A progress line to print as it happens. */
  message?: string;
  /** Sent once at the end of the test, for the final line. */
  summary?: ProgressSummary;
}

declare module 'vitest' {
  interface TestArtifactRegistry {
    [PHASE_ARTIFACT]: TestserverPhaseArtifact;
  }
}
