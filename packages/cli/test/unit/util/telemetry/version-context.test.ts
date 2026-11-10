import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetVersionContext = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/util/version-context', () => ({
  getVersionContext: mockGetVersionContext,
}));

import {
  collectVersionContextForTelemetry,
  getVersionContextTelemetryEvents,
} from '../../../../src/util/telemetry/version-context';

describe('collectVersionContextForTelemetry', () => {
  beforeEach(() => {
    mockGetVersionContext.mockReset();
  });

  it('returns bounded installer metadata', async () => {
    mockGetVersionContext.mockResolvedValue({
      version: '59.19.1',
      runtime: 'native',
      manager: 'installer',
      canSwitchVersions: true,
      installRoot: '/Users/example/.vercel',
      track: 'production',
      slot: 'a',
      activeVersion: '59.19.1',
      pendingProduction: undefined,
      prBuild: undefined,
    });

    await expect(collectVersionContextForTelemetry()).resolves.toEqual({
      status: 'resolved',
      source: 'detected',
      runtime: 'native',
      manager: 'installer',
      track: 'production',
      slot: 'a',
    });
  });

  it('returns bounded package-manager metadata', async () => {
    mockGetVersionContext.mockResolvedValue({
      version: '59.19.1',
      runtime: 'node',
      manager: 'package-manager',
      canSwitchVersions: false,
      packageManager: 'pnpm',
      packageManagerAssumed: false,
      global: true,
      upgradeCommand: 'pnpm i -g vercel@latest',
    });

    await expect(collectVersionContextForTelemetry()).resolves.toEqual({
      status: 'resolved',
      source: 'detected',
      runtime: 'node',
      manager: 'package-manager',
      packageManager: 'pnpm',
      packageManagerAssumed: false,
      global: true,
    });
  });

  it('reports cancellation separately from missing data', async () => {
    mockGetVersionContext.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        })
    );

    await expect(collectVersionContextForTelemetry(1)).resolves.toEqual({
      status: 'cancelled',
      source: 'detected',
    });
  });

  it('reports unexpected failures without their error details', async () => {
    mockGetVersionContext.mockRejectedValue(new Error('/private/path'));

    await expect(collectVersionContextForTelemetry()).resolves.toEqual({
      status: 'error',
      source: 'detected',
    });
  });
});

describe('getVersionContextTelemetryEvents', () => {
  it('creates independently queryable events for resolved dimensions', () => {
    expect(
      getVersionContextTelemetryEvents({
        status: 'resolved',
        source: 'cache',
        runtime: 'node',
        manager: 'package-manager',
        packageManager: 'pnpm',
        packageManagerAssumed: false,
        global: true,
      })
    ).toEqual([
      { key: 'version_context_status', value: 'resolved' },
      { key: 'version_context_source', value: 'cache' },
      { key: 'version_context_runtime', value: 'node' },
      { key: 'version_context_manager', value: 'package-manager' },
      { key: 'version_context_package_manager', value: 'pnpm' },
      {
        key: 'version_context_package_manager_assumed',
        value: 'false',
      },
      { key: 'version_context_global', value: 'true' },
    ]);
  });

  it.each([
    'cancelled',
    'error',
  ] as const)('emits an explicit %s status without ambiguous dimension values', status => {
    expect(
      getVersionContextTelemetryEvents({ status, source: 'cache' })
    ).toEqual([
      { key: 'version_context_status', value: status },
      { key: 'version_context_source', value: 'cache' },
    ]);
  });
});
