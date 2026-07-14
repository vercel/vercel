import { describe, expect, it, beforeEach } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';

describe('invocation_id tracking', () => {
  let telemetry: RootTelemetryClient;
  let telemetryEventStore: TelemetryEventStore;

  beforeEach(() => {
    telemetryEventStore = new TelemetryEventStore({
      isDebug: true,
      config: {
        enabled: true,
      },
    });

    telemetry = new RootTelemetryClient({
      opts: {
        store: telemetryEventStore,
      },
    });
  });

  it('tracks invocation_id as a regular telemetry event', () => {
    telemetry.trackInvocationId(telemetryEventStore.currentInvocationId);

    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      {
        key: 'invocation_id',
        value: telemetryEventStore.currentInvocationId,
      },
    ]);
  });
});
