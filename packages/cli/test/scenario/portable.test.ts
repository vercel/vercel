import { beforeAll, describe, expect, it } from 'vitest';
import { assertBuiltCli } from './harness/run-cli';
import { loadManifest, loadScenario } from './portable/runner/load';
import { runScenario } from './portable/runner/run-scenario';

// Scenarios come from generated artifacts only; see portable/RUNNER-CONTRACT.md.
const manifest = loadManifest();

beforeAll(() => {
  assertBuiltCli();
});

describe('portable world-state scenarios', () => {
  for (const entry of manifest.scenarios) {
    it(entry.id, async context => {
      const scenario = loadScenario(entry.path);
      const result = await runScenario(scenario);
      if (result.status === 'skipped') {
        context.skip(result.reason);
        return;
      }
      expect(result.failures, result.diagnostics).toEqual([]);
    });
  }
});
