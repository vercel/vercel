import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';

const launchKey = Symbol.for('vercel.cli.launch');

function track(launch: unknown) {
  (globalThis as Record<symbol, unknown>)[launchKey] = launch;
  const store = new TelemetryEventStore({ config: { enabled: true } });
  new RootTelemetryClient({ opts: { store } }).trackCliLaunch();
  return store.readonlyEvents.map(({ key, value }) => ({ key, value }));
}

describe('trackCliLaunch', () => {
  afterEach(() => {
    delete (globalThis as Record<symbol, unknown>)[launchKey];
    vi.unstubAllEnvs();
  });

  it('reports the native binary', () => {
    expect(track({ runtime: 'native' })).toEqual([
      { key: 'launcher', value: 'native' },
    ]);
  });

  it('does not treat an inherited VERCEL_VC_NATIVE as the native binary', () => {
    vi.stubEnv('VERCEL_VC_NATIVE', '1');
    expect(track(undefined)).toEqual([]);
  });

  it.each([
    'download',
    'cache',
  ])('reports a native binary from the launcher %s', source => {
    expect(track({ runtime: 'native', source })).toEqual([
      { key: 'launcher', value: 'native' },
      { key: 'launcher_source', value: source },
    ]);
  });

  it('reports an unexpected native source as other', () => {
    expect(track({ runtime: 'native', source: '/home/me/vercel' })).toEqual([
      { key: 'launcher', value: 'native' },
      { key: 'launcher_source', value: 'other' },
    ]);
  });

  it.each([
    'opt_out',
    'inherited_native_env',
    'download_failed',
  ])('reports the %s fallback reason', reason => {
    expect(track({ runtime: 'dist', target: 'darwin-arm64', reason })).toEqual([
      { key: 'launcher', value: 'dist' },
      { key: 'launcher_target', value: 'darwin-arm64' },
      { key: 'launcher_fallback', value: reason },
    ]);
  });

  it('reports @vercel/cli-support', () => {
    expect(track({ runtime: 'cli-support', target: 'cli-support' })).toEqual([
      { key: 'launcher', value: 'cli-support' },
    ]);
  });

  it('reports a dist fallback with its target and reason', () => {
    expect(
      track({
        runtime: 'dist',
        target: 'linux-x64-musl',
        reason: 'EACCES',
      })
    ).toEqual([
      { key: 'launcher', value: 'dist' },
      { key: 'launcher_target', value: 'linux-x64-musl' },
      { key: 'launcher_fallback', value: 'EACCES' },
    ]);
  });

  it('reports unexpected values as other', () => {
    expect(
      track({
        runtime: 'dist',
        target: '/home/me/secret',
        reason: 42,
      })
    ).toEqual([
      { key: 'launcher', value: 'dist' },
      { key: 'launcher_target', value: 'other' },
      { key: 'launcher_fallback', value: 'other' },
    ]);
  });

  it('reports nothing when the CLI was not started by dist/vc.js', () => {
    expect(track(undefined)).toEqual([]);
  });
});
