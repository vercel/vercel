import type { Reporter, TestCase, Vitest } from 'vitest/node';
import type { TestArtifact } from 'vitest';
import {
  PHASE_ARTIFACT,
  type ProgressSummary,
  type TestserverPhaseArtifact,
} from './progress-events';
import { testserverBases } from './sandbox-pool';

// Prints Testserver progress as it happens: one line per step, prefixed with
// the time since the run started and the worker, so overlapping tests are
// visible. Fixtures send the events (fixtures/progress.ts).

const NAME_WIDTH = 48;

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function fitName(name: string): string {
  return name.length > NAME_WIDTH
    ? `${name.slice(0, NAME_WIDTH - 1)}…`
    : name.padEnd(NAME_WIDTH);
}

function isPhase(artifact: TestArtifact): artifact is TestserverPhaseArtifact {
  return artifact.type === PHASE_ARTIFACT;
}

function formatSummary({ totalMs, teardownMs, phases }: ProgressSummary) {
  const otherMs = Math.max(
    0,
    totalMs -
      teardownMs -
      phases.containerMs -
      phases.seedMs -
      phases.authMs -
      phases.cliMs
  );
  return [
    `container ${secs(phases.containerMs)}`,
    `seed ${secs(phases.seedMs)} ×${phases.seedCalls}`,
    `auth ${secs(phases.authMs)}`,
    `cli ${secs(phases.cliMs)} ×${phases.cliRuns}`,
    `other ${secs(otherMs)}`,
    `teardown ${secs(teardownMs)}`,
  ].join(' | ');
}

export default class TestserverProgressReporter implements Reporter {
  private vitest: Vitest | undefined;
  private runStartedAt = Date.now();
  private readonly workers = new Map<string, string>();
  private readonly summaries = new Map<string, ProgressSummary>();

  onInit(vitest: Vitest) {
    this.vitest = vitest;
  }

  onTestRunStart() {
    this.runStartedAt = Date.now();
    const sandboxes = testserverBases().length;
    if (sandboxes > 0) {
      const against =
        sandboxes === 1 ? 'one sandbox' : `${sandboxes} sandboxes`;
      this.print(
        `[testserver] up to ${this.vitest?.config.maxWorkers ?? '?'} test files run in parallel against ${against}; tests in a file run one at a time. Each test gets its own container.`
      );
    }
  }

  onTestCaseArtifactRecord(testCase: TestCase, artifact: TestArtifact) {
    if (!isPhase(artifact)) return;
    this.workers.set(testCase.id, artifact.worker);
    if (artifact.summary) {
      this.summaries.set(testCase.id, artifact.summary);
    }
    if (artifact.message) {
      this.line(testCase, artifact.worker, artifact.message);
    }
  }

  onTestCaseResult(testCase: TestCase) {
    const worker = this.workers.get(testCase.id);
    if (!worker) return; // never reached the Testserver (e.g. skipped)
    const summary = this.summaries.get(testCase.id);
    const { state } = testCase.result();
    const mark =
      state === 'passed' ? '✓ passed' : state === 'failed' ? '✗ failed' : state;
    this.line(
      testCase,
      worker,
      summary
        ? `${mark} ${secs(summary.totalMs)} (${formatSummary(summary)})`
        : mark
    );
  }

  private line(testCase: TestCase, worker: string, message: string) {
    const offset = `+${secs(Date.now() - this.runStartedAt)}`.padEnd(7);
    this.print(
      `${offset} w${worker.padEnd(2)} ${fitName(testCase.fullName)} ${message}`
    );
  }

  private print(text: string) {
    if (this.vitest) {
      this.vitest.logger.log(text);
    } else {
      console.log(text);
    }
  }
}
