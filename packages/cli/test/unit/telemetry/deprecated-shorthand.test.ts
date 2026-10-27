import { beforeEach, describe, expect, it } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';

describe('deprecated short flag telemetry', () => {
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

  it('records each hidden letter that was used, never its value', () => {
    telemetry.trackCliDeprecatedShorthands(['-d', '-l']);

    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      { key: 'deprecated_shorthand', value: '-d' },
      { key: 'deprecated_shorthand', value: '-l' },
    ]);
  });

  it('records nothing when no hidden letter was used', () => {
    telemetry.trackCliDeprecatedShorthands([]);

    expect(telemetryEventStore.readonlyEvents).toEqual([]);
  });
});
