import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';

describe('persisted cli telemetry device id', () => {
  let deviceFilePath: string;

  beforeEach(() => {
    deviceFilePath = join(
      tmpdir(),
      `vercel-cli-telemetry-device-${randomUUID()}.json`
    );
    rmSync(deviceFilePath, { force: true });
  });

  it('reuses the same device id across invocations', () => {
    const firstStore = new TelemetryEventStore({
      config: { enabled: true },
      isDebug: true,
      cliDevice: {
        filePath: deviceFilePath,
      },
    });
    const secondStore = new TelemetryEventStore({
      config: { enabled: true },
      isDebug: true,
      cliDevice: {
        filePath: deviceFilePath,
      },
    });

    expect(secondStore.currentDeviceId).toBe(firstStore.currentDeviceId);
  });

  it('tracks device_id as a regular telemetry event', () => {
    const telemetryEventStore = new TelemetryEventStore({
      config: { enabled: true },
      isDebug: true,
      cliDevice: {
        filePath: deviceFilePath,
      },
    });
    const telemetry = new RootTelemetryClient({
      opts: {
        store: telemetryEventStore,
      },
    });

    telemetry.trackDeviceId(telemetryEventStore.currentDeviceId);

    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      {
        key: 'device_id',
        value: telemetryEventStore.currentDeviceId,
      },
    ]);
  });
});
