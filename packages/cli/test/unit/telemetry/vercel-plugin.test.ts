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

  it('reads the install id when the marker carries one', () => {
    writeMarker({
      schema: 1,
      active: true,
      pluginVersion: '0.49.0',
      updatedAt: 1000,
      expiresAt: 2000,
      installId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    });

    expect(
      readVercelPluginActiveSessionMarker({
        filePath: markerFilePath,
        now: () => 1500,
      })
    ).toEqual({
      pluginVersion: '0.49.0',
      installId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    });
  });

  it('keeps the marker when the install id is absent or malformed', () => {
    for (const installId of [
      undefined,
      'not-a-uuid',
      '',
      42,
      '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    ]) {
      writeMarker({
        schema: 1,
        active: true,
        pluginVersion: '0.49.0',
        updatedAt: 1000,
        expiresAt: 2000,
        installId,
      });

      expect(
        readVercelPluginActiveSessionMarker({
          filePath: markerFilePath,
          now: () => 1500,
        })
      ).toEqual({ pluginVersion: '0.49.0' });
    }
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
    telemetry.trackVercelPluginInstallId(
      '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    );

    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      {
        key: 'vercel_plugin_active_session',
        value: 'TRUE',
      },
      {
        key: 'vercel_plugin_version',
        value: '0.42.1',
      },
      {
        key: 'vercel_plugin_install_id',
        value: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      },
    ]);
  });

  it('omits the install id event when the marker has none', () => {
    const telemetryEventStore = new TelemetryEventStore({
      isDebug: true,
      config: { enabled: true },
    });
    const telemetry = new RootTelemetryClient({
      opts: { store: telemetryEventStore },
    });

    telemetry.trackVercelPluginActiveSession();
    telemetry.trackVercelPluginInstallId(undefined);

    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      {
        key: 'vercel_plugin_active_session',
        value: 'TRUE',
      },
    ]);
  });
});
