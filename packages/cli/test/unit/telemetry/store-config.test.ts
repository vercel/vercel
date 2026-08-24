import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';

describe('TelemetryEventStore config gating', () => {
  beforeEach(() => {
    // CI exports this globally; these tests assert the config gate itself.
    vi.stubEnv('VERCEL_TELEMETRY_DISABLED', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is disabled until the global config is loaded', () => {
    const store = new TelemetryEventStore();
    expect(store.enabled).toBe(false);
  });

  it('is enabled after updateConfig, including undefined telemetry config', () => {
    const store = new TelemetryEventStore();
    store.updateConfig(undefined);
    expect(store.enabled).toBe(true);
  });

  it('respects an explicit opt-out from updateConfig', () => {
    const store = new TelemetryEventStore();
    store.updateConfig({ enabled: false });
    expect(store.enabled).toBe(false);
  });

  it('is enabled when constructed with a config', () => {
    const store = new TelemetryEventStore({ config: {} });
    expect(store.enabled).toBe(true);
  });

  it('save() is a no-op with no buffered events', async () => {
    const store = new TelemetryEventStore({ config: { enabled: true } });
    await expect(store.save()).resolves.toBeUndefined();
  });

  it('save() flushes buffered events once enabled', async () => {
    const store = new TelemetryEventStore({ isDebug: true });
    const client = new RootTelemetryClient({ opts: { store } });
    client.trackPlatform();
    store.updateConfig(undefined);
    await expect(store.save()).resolves.toBeUndefined();
    expect(store.readonlyEvents).toHaveLength(1);
  });
});
