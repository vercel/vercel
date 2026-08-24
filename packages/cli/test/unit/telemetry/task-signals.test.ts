import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';
import { fp } from '../../../src/util/telemetry/sanitize';

let telemetry: RootTelemetryClient;
let store: TelemetryEventStore;

beforeEach(() => {
  store = new TelemetryEventStore({ isDebug: true, config: {} });
  telemetry = new RootTelemetryClient({ opts: { store } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('output:deploy_state', () => {
  it('tracks ready-state constants', () => {
    telemetry.trackDeployState('ERROR');
    expect(store.readonlyEvents).toMatchObject([
      { key: 'output:deploy_state', value: 'ERROR' },
    ]);
  });

  it('redacts unexpected values', () => {
    telemetry.trackDeployState('weird value');
    expect(store.readonlyEvents[0]?.value).toBe('[REDACTED]');
  });
});

describe('output:logs_matched', () => {
  it('tracks SOME and NONE', () => {
    telemetry.trackLogsMatched(true);
    telemetry.trackLogsMatched(false);
    expect(store.readonlyEvents.map(e => e.value)).toEqual(['SOME', 'NONE']);
  });
});

describe('args_fingerprint', () => {
  it('tracks the salted fingerprint of the argv structure', () => {
    telemetry.trackArgsFingerprint(['deploy', '1', '--prod'], 'salt-1');
    expect(store.readonlyEvents).toMatchObject([
      {
        key: 'args_fingerprint',
        value: fp(['deploy', '1', '--prod'], 'salt-1'),
      },
    ]);
    expect(store.readonlyEvents[0]?.value).not.toContain('deploy');
  });

  it('uses a local-only salt that is not the transmitted device id', () => {
    const s = new TelemetryEventStore({ config: {} });
    expect(s.currentFpSalt).not.toBe(s.currentDeviceId);
  });
});

describe('agent_task_id', () => {
  it('tracks UUID-shaped ids and skips absent ones', () => {
    telemetry.trackAgentTaskId('A81BC81B-DEAD-4E5D-ABFF-90865D1E13B1');
    telemetry.trackAgentTaskId(undefined);
    expect(store.readonlyEvents).toMatchObject([
      { key: 'agent_task_id', value: 'a81bc81b-dead-4e5d-abff-90865d1e13b1' },
    ]);
  });

  it('redacts anything that could carry user content', () => {
    telemetry.trackAgentTaskId('fix-payments-bug-for-acme');
    telemetry.trackAgentTaskId('x'.repeat(65));
    expect(store.readonlyEvents.map(e => e.value)).toEqual([
      '[REDACTED]',
      '[REDACTED]',
    ]);
  });
});
