import { afterEach, describe, expect, it, vi } from 'vitest';
import { join, sep } from 'path';
import { client } from '../../../mocks/client';
import version from '../../../../src/commands/version';
import type { VersionContext } from '../../../../src/util/version-context';

const mockGetVersionContext = vi.hoisted(() => vi.fn());
const mockInstallAndLinkPrBinary = vi.hoisted(() => vi.fn());

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
    installAndLinkPrBinary: (...args: unknown[]) =>
      mockInstallAndLinkPrBinary(...args),
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
    linkedVersion: '59.6.3',
    pinnedVersion: undefined,
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
    mockInstallAndLinkPrBinary.mockReset();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('version', '--help');
      const exitCode = await version(client);
      expect(exitCode).toEqual(2);
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
      expect(output).not.toContain('Upgrade command:');
      expect(output).not.toContain('Managed by: package manager');
    });

    it('describes a package-manager-installed native binary', async () => {
      mockGetVersionContext.mockResolvedValue(
        packageManagerContext({
          runtime: 'native',
          packageManager: 'npm',
          global: true,
          upgradeCommand: 'npm i -g @vercel/vc-native@latest --force',
        })
      );
      client.setArgv('version');

      const exitCode = await version(client);

      expect(exitCode).toBe(0);
      const output = client.stderr.getFullOutput();
      expect(output).toContain('Runtime: native binary');
      expect(output).toContain('Managed by: package manager (npm, global)');
      expect(output).toContain(
        'Upgrade command: npm i -g @vercel/vc-native@latest --force'
      );
      expect(output).toContain(
        'the recommended way to manage the Vercel CLI is the installer'
      );
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
          upgradeCommand:
            'pnpm i -g @vercel/vc-native@latest --allow-build=@vercel/vc-native',
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
        'Or install this version with pnpm: pnpm i -g @vercel/vc-native@58.0.0 --allow-build=@vercel/vc-native'
      );
      expect(output).not.toContain('npm i -g vercel@58.0.0');
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

    it('says the SHA exists when this platform is not ready yet', async () => {
      mockGetVersionContext.mockResolvedValue(installerContext());
      mockInstallAndLinkPrBinary.mockRejectedValue(
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
      expect(output).not.toContain('Error:');
    });
  });
});
