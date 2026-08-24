import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';

describe('exit_code tracking', () => {
  let telemetry: RootTelemetryClient;
  let telemetryEventStore: TelemetryEventStore;

  beforeEach(() => {
    telemetryEventStore = new TelemetryEventStore({
      isDebug: true,
      config: { enabled: true },
    });
    telemetry = new RootTelemetryClient({
      opts: { store: telemetryEventStore },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('tracks exit_code when v2 flag is enabled', () => {
    vi.stubEnv('VERCEL_CLI_TELEMETRY_V2', '1');
    telemetry.trackExitCode(1);
    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      { key: 'exit_code', value: '1' },
    ]);
  });

  it('tracks nothing without the v2 flag', () => {
    telemetry.trackExitCode(1);
    expect(telemetryEventStore.readonlyEvents).toHaveLength(0);
  });
});
