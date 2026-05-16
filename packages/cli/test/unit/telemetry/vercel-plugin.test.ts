import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';
import { readVercelPluginActiveSessionMarker } from '../../../src/util/telemetry/vercel-plugin';

describe('vercel plugin active-session marker', () => {
  let markerFilePath: string;

  beforeEach(() => {
    markerFilePath = join(
      tmpdir(),
      `vercel-plugin-active-session-${randomUUID()}.json`
    );
    rmSync(markerFilePath, { force: true });
  });

  function writeMarker(marker: unknown) {
    mkdirSync(dirname(markerFilePath), { recursive: true });
    writeFileSync(markerFilePath, JSON.stringify(marker));
  }

  it('reads a fresh marker', () => {
    writeMarker({
      schema: 1,
      active: true,
      pluginVersion: '0.42.1',
      updatedAt: 1000,
      expiresAt: 2000,
    });

    expect(
      readVercelPluginActiveSessionMarker({
        filePath: markerFilePath,
        now: () => 1500,
      })
    ).toEqual({ pluginVersion: '0.42.1' });
  });

  it('ignores a missing, expired, or malformed marker', () => {
    expect(
      readVercelPluginActiveSessionMarker({ filePath: markerFilePath })
    ).toBeNull();

    writeMarker({
      schema: 1,
      active: true,
      pluginVersion: '0.42.1',
      updatedAt: 1000,
      expiresAt: 1500,
    });
    expect(
      readVercelPluginActiveSessionMarker({
        filePath: markerFilePath,
        now: () => 1500,
      })
    ).toBeNull();

    writeMarker({ schema: 1, active: true, pluginVersion: '../secret' });
    expect(
      readVercelPluginActiveSessionMarker({
        filePath: markerFilePath,
        now: () => 1000,
      })
    ).toBeNull();
  });

  it('tracks the marker as root telemetry', () => {
    const telemetryEventStore = new TelemetryEventStore({
      isDebug: true,
      config: { enabled: true },
    });
    const telemetry = new RootTelemetryClient({
      opts: { store: telemetryEventStore },
    });

    telemetry.trackVercelPluginActiveSession();
    telemetry.trackVercelPluginVersion('0.42.1');

    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      {
        key: 'vercel_plugin_active_session',
        value: 'TRUE',
      },
      {
        key: 'vercel_plugin_version',
        value: '0.42.1',
      },
    ]);
  });
});
