import { beforeEach, describe, expect, it } from 'vitest';
import { TelemetryEventStore } from '../../../../../src/util/telemetry';
import { DeployTelemetryClient } from '../../../../../src/util/telemetry/commands/deploy';

describe('DeployTelemetryClient', () => {
  let telemetry: DeployTelemetryClient;
  let telemetryEventStore: TelemetryEventStore;

  beforeEach(() => {
    telemetryEventStore = new TelemetryEventStore({
      isDebug: true,
      config: {
        enabled: true,
      },
    });
    telemetry = new DeployTelemetryClient({
      opts: {
        store: telemetryEventStore,
      },
    });
  });

  it('records that a prebuilt filePathMap collision would fail closed', () => {
    telemetry.trackPrebuiltFilePathMapWouldFailClosed();

    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      {
        key: 'output:prebuilt-filepathmap-would-fail-closed',
        value: 'TRUE',
      },
    ]);
  });
});
