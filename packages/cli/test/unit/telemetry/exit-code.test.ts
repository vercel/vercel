import { beforeEach, describe, expect, it } from 'vitest';
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

  it('tracks exit_code', () => {
    telemetry.trackExitCode(1);
    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      { key: 'exit_code', value: '1' },
    ]);
  });
});
