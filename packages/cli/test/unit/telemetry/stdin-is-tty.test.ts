import { describe, expect, it, beforeEach } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';

describe('stdin TTY tracking', () => {
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

  it('tracks stdin_is_tty as true when TTY', () => {
    telemetry.trackStdinIsTTY(true);
    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      {
        key: 'stdin_is_tty',
        value: 'true',
      },
    ]);
  });

  it('tracks stdin_is_tty as false when not TTY', () => {
    telemetry.trackStdinIsTTY(false);
    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      {
        key: 'stdin_is_tty',
        value: 'false',
      },
    ]);
  });
});
