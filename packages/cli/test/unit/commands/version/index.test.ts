import { afterEach, describe, expect, it, vi } from 'vitest';
import { join, sep } from 'path';
import { client } from '../../../mocks/client';
import version from '../../../../src/commands/version';
import { NATIVE_UPDATE_CHILD_TIMEOUT_MS } from '../../../../src/commands/version/check';
import type { VersionContext } from '../../../../src/util/version-context';

const mockGetVersionContext = vi.hoisted(() => vi.fn());
const mockInstallAndActivatePrBinary = vi.hoisted(() => vi.fn());
const mockInstallAndActivateProductionVersion = vi.hoisted(() => vi.fn());
const mockResolveLatestNativeVersion = vi.hoisted(() => vi.fn());
const mockStageProductionUpdate = vi.hoisted(() => vi.fn());
const mockCacheNativeUpdateDiscoveryAttempt = vi.hoisted(() => vi.fn());
const mockCacheNativeUpdateVersion = vi.hoisted(() => vi.fn());
const mockMarkNativeUpdateStaged = vi.hoisted(() => vi.fn());
const mockRestoreNativeUpdateAfterDiscoveryFailure = vi.hoisted(() => vi.fn());
const mockListAvailableVersions = vi.hoisted(() => vi.fn());
const mockUnref = vi.hoisted(() => vi.fn());
const mockSpawn = vi.hoisted(() =>
  vi.fn(() => ({ on: vi.fn(), unref: mockUnref }))
);

vi.mock('node:child_process', async importOriginal => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: mockSpawn,
}));

vi.mock('../../../../src/commands/version/native-auto-update', () => ({
  cacheNativeUpdateDiscoveryAttempt: (...args: unknown[]) =>
    mockCacheNativeUpdateDiscoveryAttempt(...args),
  cacheNativeUpdateVersion: (...args: unknown[]) =>
    mockCacheNativeUpdateVersion(...args),
  isNativeAutoUpdateEnabled: (config: { updates?: { auto?: boolean } }) =>
    config.updates?.auto !== false,
  markNativeUpdateStaged: (...args: unknown[]) =>
    mockMarkNativeUpdateStaged(...args),
  restoreNativeUpdateAfterDiscoveryFailure: (...args: unknown[]) =>
    mockRestoreNativeUpdateAfterDiscoveryFailure(...args),
}));

vi.mock('../../../../src/util/version-context', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../src/util/version-context')
  >('../../../../src/util/version-context');
  return {
    ...actual,
    getVersionContext: () => mockGetVersionContext(),
  };
});

vi.mock('../../../../src/util/native-self-update', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../src/util/native-self-update')
  >('../../../../src/util/native-self-update');
  return {
    ...actual,
    installAndActivatePrBinary: (...args: unknown[]) =>
      mockInstallAndActivatePrBinary(...args),
    installAndActivateProductionVersion: (...args: unknown[]) =>
      mockInstallAndActivateProductionVersion(...args),
    resolveLatestNativeVersion: (...args: unknown[]) =>
      mockResolveLatestNativeVersion(...args),
    stageProductionUpdate: (...args: unknown[]) =>
      mockStageProductionUpdate(...args),
    listAvailableVersions: () => mockListAvailableVersions(),
  };
});

const installRoot = join(sep, 'home', 'user', '.vercel');

function installerContext(
  overrides: Partial<Extract<VersionContext, { manager: 'installer' }>> = {}
): VersionContext {
  return {
    version: '59.6.3',
    runtime: 'native',
    manager: 'installer',
    canSwitchVersions: true,
    installRoot,
    track: 'production',
    slot: 'a',
    activeVersion: '59.6.3',
    pendingProduction: undefined,
    prBuild: undefined,
    ...overrides,
  };
}

function packageManagerContext(
  overrides: Partial<
    Extract<VersionContext, { manager: 'package-manager' }>
  > = {}
): VersionContext {
  return {
    version: '59.6.3',
    runtime: 'node',
    manager: 'package-manager',
    canSwitchVersions: false,
    packageManager: 'npm',
    packageManagerAssumed: false,
    global: true,
    upgradeCommand: 'npm i -g vercel@latest',
    ...overrides,
  };
}

describe('version', () => {
  afterEach(() => {
    client.reset();
    mockGetVersionContext.mockReset();
    mockInstallAndActivatePrBinary.mockReset();
    mockInstallAndActivateProductionVersion.mockReset();
    mockResolveLatestNativeVersion.mockReset();
    mockStageProductionUpdate.mockReset();
    mockCacheNativeUpdateDiscoveryAttempt.mockReset();
    mockCacheNativeUpdateVersion.mockReset();
    mockMarkNativeUpdateStaged.mockReset();
    mockRestoreNativeUpdateAfterDiscoveryFailure.mockReset();
    mockListAvailableVersions.mockReset();
    mockSpawn.mockClear();
    mockUnref.mockClear();
    vi.useRealTimers();
    delete process.env.VERCEL_NATIVE_UPDATE_CHILD;
    delete process.env.VERCEL_NATIVE_UPDATE_VERSION;
    delete process.env.VERCEL_NATIVE_UPDATE_SELECT_PRODUCTION;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('version', '--help');
      const exitCode = await version(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'version',
        },
      ]);
    });
  });

  describe('status', () => {
    it('describes an installer-managed native binary', async () => {
      mockGetVersionContext.mockResolvedValue(installerContext());
      client.setArgv('version');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      const output = client.stderr.getFullOutput();
      expect(output).toContain('Version: 59.6.3');
      expect(output).toContain('Runtime: native binary');
      expect(output).toContain(`Managed by: Vercel installer (${installRoot})`);
      expect(output).not.toContain('Track:');
      expect(output).not.toContain('Slot:');
      expect(output).toContain('Active version: 59.6.3');
      expect(output).toContain('Automatic updates: Enabled');
      expect(output).not.toContain('Upgrade command:');
      expect(output).not.toContain('Managed by: package manager');
    });

    it('reports a staged production update while a PR is selected', async () => {
      mockGetVersionContext.mockResolvedValue(
        installerContext({
          track: 'pr',
          slot: 'b',
          activeVersion: 'pr/123',
          prBuild: { number: 123, sha: 'a'.repeat(40) },
          pendingProduction: { slot: 'b', version: '60.0.0' },
        })
      );
      client.setArgv('version');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      const output = client.stderr.getFullOutput();
      expect(output).not.toContain('Track:');
      expect(output).not.toContain('Slot:');
      expect(output).toContain('Active build: PR #123 (aaaaaaaaaaaa)');
      expect(output).toContain('Pending production: 60.0.0 (production/b)');
    });

    it('describes a package-manager-installed native binary', async () => {
      mockGetVersionContext.mockResolvedValue(
        packageManagerContext({
          runtime: 'native',
          packageManager: 'npm',
          global: true,
          upgradeCommand: 'npm i -g vercel@latest',
        })
      );
      client.setArgv('version');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      const output = client.stderr.getFullOutput();
      expect(output).toContain('Runtime: native binary');
      expect(output).toContain('Managed by: package manager (npm, global)');
      expect(output).toContain('Upgrade command: npm i -g vercel@latest');
      expect(output).not.toContain('@vercel/vc-native');
      expect(output).not.toContain('--force');
    });

    it('describes a Node.js package-manager install', async () => {
      mockGetVersionContext.mockResolvedValue(
        packageManagerContext({
          runtime: 'node',
          packageManager: 'pnpm',
          global: false,
          upgradeCommand: 'pnpm i vercel@latest',
        })
      );
      client.setArgv('version');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      const output = client.stderr.getFullOutput();
      expect(output).toContain('Runtime: Node.js');
      expect(output).toContain('Managed by: package manager (pnpm, local)');
      expect(output).toContain('Upgrade command: pnpm i vercel@latest');
    });

    it('says npm is assumed when the package manager was not detected', async () => {
      mockGetVersionContext.mockResolvedValue(
        packageManagerContext({
          packageManagerAssumed: true,
        })
      );
      client.setArgv('version');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      const output = client.stderr.getFullOutput();
      expect(output).toContain(
        'Managed by: package manager (assumed npm, global)'
      );
      expect(output).toContain('Upgrade command: npm i -g vercel@latest');
    });
  });

  describe('installed', () => {
    it('reports only the current version for package-manager installs', async () => {
      mockGetVersionContext.mockResolvedValue(packageManagerContext());
      client.setArgv('version', 'installed');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      const output = client.stderr.getFullOutput();
      expect(output).toContain('59.6.3');
      expect(output).toContain('managed by npm');
    });

    it('says npm is assumed when the package manager was not detected', async () => {
      mockGetVersionContext.mockResolvedValue(
        packageManagerContext({ packageManagerAssumed: true })
      );
      client.setArgv('version', 'installed');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        'managed by npm (assumed)'
      );
    });
  });

  describe('use', () => {
    it('rejects package-manager installs with the detected upgrade command', async () => {
      mockGetVersionContext.mockResolvedValue(
        packageManagerContext({
          runtime: 'native',
          upgradeCommand: 'pnpm i -g vercel@latest --allow-build=esbuild',
          packageManager: 'pnpm',
        })
      );
      client.setArgv('version', 'use', '58.0.0');

      const exitCode = await version(client);

      expect(exitCode).toBe(1);
      const output = client.stderr.getFullOutput();
      expect(output).toContain(
        'Switching versions is only supported for installer-managed CLIs.'
      );
      expect(output).toContain(
        'Or install this version with pnpm: pnpm i -g vercel@58.0.0 --allow-build=esbuild'
      );
      expect(output).not.toContain('@vercel/vc-native');
      expect(output).not.toContain('--force');
      expect(output).not.toContain('with npm:');
    });

    it('says npm is assumed when suggesting a fallback install command', async () => {
      mockGetVersionContext.mockResolvedValue(
        packageManagerContext({ packageManagerAssumed: true })
      );
      client.setArgv('version', 'use', '58.0.0');

      const exitCode = await version(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Or install this version with npm (assumed): npm i -g vercel@58.0.0'
      );
    });

    it('activates a specific version on production without pinning it', async () => {
      mockGetVersionContext.mockResolvedValue(installerContext());
      mockListAvailableVersions.mockResolvedValue(['58.0.0']);
      mockInstallAndActivateProductionVersion.mockResolvedValue({
        slot: 'b',
        downloaded: true,
      });
      client.setArgv('version', 'use', '58.0.0');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      expect(mockInstallAndActivateProductionVersion).toHaveBeenCalledWith(
        '58.0.0'
      );
      const commandOutput = client.stderr.getFullOutput();
      expect(commandOutput).toContain('Vercel CLI v58.0.0 is active');
      expect(commandOutput).toContain(
        'Older CLI versions can replace the installer-managed links'
      );
      expect(commandOutput).toContain(
        'curl -fsSL https://api-frameworks.vercel.sh/install | bash'
      );
      expect(commandOutput).not.toContain('pinned');
    });

    it('does not warn when activating the current production version', async () => {
      mockGetVersionContext.mockResolvedValue(installerContext());
      mockListAvailableVersions.mockResolvedValue(['59.6.3']);
      mockInstallAndActivateProductionVersion.mockResolvedValue({
        slot: 'a',
        downloaded: false,
      });
      client.setArgv('version', 'use', '59.6.3');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain(
        'Older CLI versions can replace the installer-managed links'
      );
    });

    it('installs the latest release through the shared installer path', async () => {
      mockGetVersionContext.mockResolvedValue(installerContext());
      mockResolveLatestNativeVersion.mockResolvedValue('60.0.0');
      mockInstallAndActivateProductionVersion.mockResolvedValue({
        slot: 'b',
        downloaded: true,
      });
      client.setArgv('version', 'use', 'latest');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      expect(mockInstallAndActivateProductionVersion).toHaveBeenCalledWith(
        '60.0.0'
      );
      const output = client.stderr.getFullOutput();
      expect(output).toContain('Upgraded Vercel CLI to v60.0.0.');
      expect(output).not.toContain('Upgrade failed');
    });

    it('says the SHA exists when this platform is not ready yet', async () => {
      mockGetVersionContext.mockResolvedValue(installerContext());
      mockInstallAndActivatePrBinary.mockRejectedValue(
        new Error(
          `Couldn't find a darwin-arm64 binary for PR #115 (abcdef012345). This SHA exists, but this platform isn't ready yet.`
        )
      );
      client.setArgv('version', 'use', 'pr/115');

      const exitCode = await version(client);

      expect(exitCode).toBe(1);
      const output = client.stderr.getFullOutput();
      expect(output).toContain(
        `Couldn't find a darwin-arm64 binary for PR #115 (abcdef012345). This SHA exists, but this platform isn't ready yet.`
      );
      expect(output).not.toContain('Failed to switch to the PR #115 build');
    });
  });

  describe('check', () => {
    it('reports latest and launches a detached update child', async () => {
      mockGetVersionContext.mockResolvedValue(installerContext());
      mockResolveLatestNativeVersion.mockResolvedValue('60.0.0');
      client.setArgv('version', 'check');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        'Latest production version: 60.0.0'
      );
      expect(mockCacheNativeUpdateVersion).toHaveBeenCalledWith('60.0.0', {
        selectProduction: true,
      });
      expect(mockSpawn).toHaveBeenCalledWith(
        process.execPath,
        ['version', 'check'],
        expect.objectContaining({
          detached: true,
          stdio: 'ignore',
          env: expect.objectContaining({
            VERCEL_NATIVE_UPDATE_CHILD: '1',
            VERCEL_NATIVE_UPDATE_VERSION: '60.0.0',
            VERCEL_NATIVE_UPDATE_SELECT_PRODUCTION: '1',
          }),
        })
      );
      expect(mockUnref).toHaveBeenCalled();
      expect(mockStageProductionUpdate).not.toHaveBeenCalled();
    });

    it('reports when production is already up to date without spawning', async () => {
      mockGetVersionContext.mockResolvedValue(installerContext());
      mockResolveLatestNativeVersion.mockResolvedValue('59.6.3');
      client.setArgv('version', 'check');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      const commandOutput = client.stderr.getFullOutput();
      expect(commandOutput).toContain('Latest production version: 59.6.3');
      expect(commandOutput).toContain('Production is already up to date.');
      expect(commandOutput).not.toContain(
        'Production update started in the background.'
      );
      expect(mockCacheNativeUpdateVersion).toHaveBeenCalledWith('59.6.3');
      expect(mockMarkNativeUpdateStaged).toHaveBeenCalledWith('59.6.3', {
        selectedProduction: true,
      });
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('refreshes metadata and stages it in a detached discovery child', async () => {
      vi.useFakeTimers();
      mockGetVersionContext.mockResolvedValue(installerContext());
      mockResolveLatestNativeVersion.mockResolvedValue('60.0.0');
      process.env.VERCEL_NATIVE_UPDATE_CHILD = '1';
      client.setArgv('version', 'check');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'output:native-update',
          value:
            '{"outcome":"success","source":"discovery","totalMs":0,"discoveryMs":0,"stagingMs":0}',
        },
      ]);
      expect(mockCacheNativeUpdateDiscoveryAttempt).toHaveBeenCalledOnce();
      const updateOptions = expect.objectContaining({
        signal: expect.any(AbortSignal),
      });
      expect(mockResolveLatestNativeVersion).toHaveBeenCalledWith(
        updateOptions
      );
      expect(mockCacheNativeUpdateVersion).toHaveBeenCalledWith('60.0.0');
      expect(mockStageProductionUpdate).toHaveBeenCalledWith(
        '60.0.0',
        false,
        updateOptions
      );
      expect(mockMarkNativeUpdateStaged).toHaveBeenCalledWith('60.0.0', {
        selectedProduction: false,
      });
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('records a one-day attempt when detached discovery fails', async () => {
      mockGetVersionContext.mockResolvedValue(installerContext());
      mockResolveLatestNativeVersion.mockRejectedValue(
        new Error('registry unavailable')
      );
      process.env.VERCEL_NATIVE_UPDATE_CHILD = '1';
      client.setArgv('version', 'check');

      const exitCode = await version(client);

      expect(exitCode).toBe(1);
      const event = client.telemetryEventStore.readonlyEvents.find(
        ({ key }) => key === 'output:native-update'
      );
      expect(event).toBeDefined();
      expect(JSON.parse(event!.value)).toMatchObject({
        outcome: 'failure',
        source: 'discovery',
        totalMs: expect.any(Number),
        discoveryMs: expect.any(Number),
      });
      expect(mockCacheNativeUpdateDiscoveryAttempt).toHaveBeenCalledOnce();
      expect(mockCacheNativeUpdateVersion).not.toHaveBeenCalled();
      expect(
        mockRestoreNativeUpdateAfterDiscoveryFailure
      ).toHaveBeenCalledOnce();
      expect(mockStageProductionUpdate).not.toHaveBeenCalled();
    });

    it('aborts detached discovery at its deadline', async () => {
      vi.useFakeTimers();
      mockGetVersionContext.mockResolvedValue(installerContext());
      let signal: AbortSignal | undefined;
      mockResolveLatestNativeVersion.mockImplementation(
        ({ signal: updateSignal }: { signal: AbortSignal }) => {
          signal = updateSignal;
          return new Promise((_resolve, reject) => {
            updateSignal.addEventListener(
              'abort',
              () => reject(updateSignal.reason),
              { once: true }
            );
          });
        }
      );
      process.env.VERCEL_NATIVE_UPDATE_CHILD = '1';
      client.setArgv('version', 'check');

      const result = version(client);
      for (let i = 0; i < 10 && !signal; i++) await Promise.resolve();
      await vi.advanceTimersByTimeAsync(NATIVE_UPDATE_CHILD_TIMEOUT_MS);

      await expect(result).resolves.toBe(1);
      expect(signal?.aborted).toBe(true);
      expect(NATIVE_UPDATE_CHILD_TIMEOUT_MS).toBe(120_000);
      const event = client.telemetryEventStore.readonlyEvents.find(
        ({ key }) => key === 'output:native-update'
      );
      expect(event).toBeDefined();
      expect(JSON.parse(event!.value)).toMatchObject({
        outcome: 'timeout',
        source: 'discovery',
        totalMs: expect.any(Number),
        discoveryMs: expect.any(Number),
      });
      expect(
        mockRestoreNativeUpdateAfterDiscoveryFailure
      ).toHaveBeenCalledOnce();
      expect(mockStageProductionUpdate).not.toHaveBeenCalled();
    });

    it('delegates a stale retry to lock-protected staging', async () => {
      mockGetVersionContext.mockResolvedValue(
        installerContext({
          version: '61.0.0',
          activeVersion: '61.0.0',
        })
      );
      process.env.VERCEL_NATIVE_UPDATE_CHILD = '1';
      process.env.VERCEL_NATIVE_UPDATE_VERSION = '60.0.0';
      process.env.VERCEL_NATIVE_UPDATE_SELECT_PRODUCTION = '0';
      client.setArgv('version', 'check');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      const event = client.telemetryEventStore.readonlyEvents.find(
        ({ key }) => key === 'output:native-update'
      );
      expect(event).toBeDefined();
      expect(JSON.parse(event!.value)).toMatchObject({
        outcome: 'success',
        source: 'cached',
        totalMs: expect.any(Number),
        stagingMs: expect.any(Number),
      });
      expect(mockStageProductionUpdate).toHaveBeenCalledWith(
        '60.0.0',
        false,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(mockMarkNativeUpdateStaged).toHaveBeenCalledWith('60.0.0', {
        selectedProduction: false,
      });
    });

    it('activates staged production by default for curl installs', async () => {
      mockGetVersionContext.mockResolvedValue(installerContext());
      process.env.VERCEL_NATIVE_UPDATE_CHILD = '1';
      process.env.VERCEL_NATIVE_UPDATE_VERSION = '60.0.0';
      process.env.VERCEL_NATIVE_UPDATE_SELECT_PRODUCTION = '1';
      client.setArgv('version', 'check');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      expect(mockStageProductionUpdate).toHaveBeenCalledWith(
        '60.0.0',
        true,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('activates production even when auto-update is explicitly disabled', async () => {
      mockGetVersionContext.mockResolvedValue(installerContext());
      process.env.VERCEL_NATIVE_UPDATE_CHILD = '1';
      process.env.VERCEL_NATIVE_UPDATE_VERSION = '60.0.0';
      process.env.VERCEL_NATIVE_UPDATE_SELECT_PRODUCTION = '1';
      client.config.updates = { auto: false };
      client.setArgv('version', 'check');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      expect(mockStageProductionUpdate).toHaveBeenCalledWith(
        '60.0.0',
        true,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('writes the available versions to stdout with --json', async () => {
      mockListAvailableVersions.mockResolvedValue(['59.7.0', '59.6.3']);
      mockGetVersionContext.mockResolvedValue(packageManagerContext());
      client.setArgv('version', 'list', '--json');

      expect(await version(client)).toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        versions: ['59.7.0', '59.6.3'],
        currentVersion: '59.6.3',
      });
      expect(client.stderr.getFullOutput()).toBe('');
    });

    it('still rejects --json on a subcommand without it', async () => {
      client.setArgv('version', 'installed', '--json');

      expect(await version(client)).toBe(2);
    });
  });
});
