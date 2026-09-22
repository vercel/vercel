import { afterEach, describe, expect, it, vi } from 'vitest';
import { join, sep } from 'path';

const {
  mockIsNative,
  mockIsCurlInstall,
  mockGetInstallRoot,
  mockGetLinkedVersion,
  mockGetPinnedVersion,
  mockGetPrBuildSha,
  mockGetUpdateCommandInfo,
} = vi.hoisted(() => ({
  mockIsNative: vi.fn(),
  mockIsCurlInstall: vi.fn(),
  mockGetInstallRoot: vi.fn(),
  mockGetLinkedVersion: vi.fn(),
  mockGetPinnedVersion: vi.fn(),
  mockGetPrBuildSha: vi.fn(),
  mockGetUpdateCommandInfo: vi.fn(),
}));

vi.mock('../../../src/util/native-install', () => ({
  isNativeBinaryInstall: () => mockIsNative(),
  getInstallRoot: () => mockGetInstallRoot(),
}));

vi.mock('../../../src/util/native-self-update', () => ({
  CURL_INSTALL_COMMAND:
    'curl -fsSL https://api-frameworks.vercel.sh/install | sh',
  isCurlInstall: () => mockIsCurlInstall(),
  getLinkedVersion: () => mockGetLinkedVersion(),
  getPinnedVersion: () => mockGetPinnedVersion(),
  getPrBuildSha: (name: string) => mockGetPrBuildSha(name),
}));

vi.mock('../../../src/util/get-update-command', () => ({
  getUpdateCommandInfo: () => mockGetUpdateCommandInfo(),
}));

vi.mock('../../../src/util/pkg', () => ({
  default: { version: '59.6.3', name: 'vercel' },
}));

import {
  CURL_INSTALL_COMMAND,
  describeManager,
  describeRuntime,
  getPackageManagerInstallCommand,
  getVersionContext,
  isInstallerManaged,
  isPackageManagerManaged,
} from '../../../src/util/version-context';

const installRoot = join(sep, 'home', 'user', '.vercel');

describe('getVersionContext', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('describes an installer-managed native binary', async () => {
    mockIsNative.mockReturnValue(true);
    mockIsCurlInstall.mockResolvedValue(true);
    mockGetInstallRoot.mockReturnValue(installRoot);
    mockGetLinkedVersion.mockResolvedValue('59.6.3');
    mockGetPinnedVersion.mockResolvedValue(undefined);

    const context = await getVersionContext();

    expect(context).toEqual({
      version: '59.6.3',
      runtime: 'native',
      manager: 'installer',
      canSwitchVersions: true,
      installRoot,
      linkedVersion: '59.6.3',
      pinnedVersion: undefined,
      prBuild: undefined,
    });
    expect(isInstallerManaged(context)).toBe(true);
    expect(describeRuntime(context)).toBe('native binary');
    expect(describeManager(context)).toBe(`Vercel installer (${installRoot})`);
    expect(mockGetUpdateCommandInfo).not.toHaveBeenCalled();
  });

  it('includes pin and PR build details for installer-managed installs', async () => {
    mockIsNative.mockReturnValue(true);
    mockIsCurlInstall.mockResolvedValue(true);
    mockGetInstallRoot.mockReturnValue(installRoot);
    mockGetLinkedVersion.mockResolvedValue('pr-115');
    mockGetPinnedVersion.mockResolvedValue('pr-115');
    mockGetPrBuildSha.mockResolvedValue('a'.repeat(40));

    const context = await getVersionContext();

    expect(context.manager).toBe('installer');
    if (context.manager !== 'installer') {
      throw new Error('expected installer context');
    }
    expect(context.pinnedVersion).toBe('pr-115');
    expect(context.prBuild).toEqual({
      name: 'pr-115',
      number: 115,
      sha: 'a'.repeat(40),
    });
  });

  it('describes a package-manager-installed native binary', async () => {
    mockIsNative.mockReturnValue(true);
    mockIsCurlInstall.mockResolvedValue(false);
    mockGetUpdateCommandInfo.mockResolvedValue({
      command: 'npm i -g @vercel/vc-native@latest --force',
      global: true,
      packageManager: 'npm',
      assumed: false,
    });

    const context = await getVersionContext();

    expect(context).toEqual({
      version: '59.6.3',
      runtime: 'native',
      manager: 'package-manager',
      canSwitchVersions: false,
      packageManager: 'npm',
      packageManagerAssumed: false,
      global: true,
      upgradeCommand: 'npm i -g @vercel/vc-native@latest --force',
    });
    expect(isPackageManagerManaged(context)).toBe(true);
    expect(describeRuntime(context)).toBe('native binary');
    expect(describeManager(context)).toBe('package manager (npm, global)');
  });

  it('describes a Node.js package-manager install', async () => {
    mockIsNative.mockReturnValue(false);
    mockIsCurlInstall.mockResolvedValue(false);
    mockGetUpdateCommandInfo.mockResolvedValue({
      command: 'pnpm i vercel@latest',
      global: false,
      packageManager: 'pnpm',
      assumed: false,
    });

    const context = await getVersionContext();

    expect(context).toEqual({
      version: '59.6.3',
      runtime: 'node',
      manager: 'package-manager',
      canSwitchVersions: false,
      packageManager: 'pnpm',
      packageManagerAssumed: false,
      global: false,
      upgradeCommand: 'pnpm i vercel@latest',
    });
    expect(describeRuntime(context)).toBe('Node.js');
    expect(describeManager(context)).toBe('package manager (pnpm, local)');
  });

  it('assumes npm when package-manager detection fails', async () => {
    mockIsNative.mockReturnValue(false);
    mockIsCurlInstall.mockResolvedValue(false);
    mockGetUpdateCommandInfo.mockRejectedValue(new Error('no package manager'));

    const context = await getVersionContext();

    expect(context).toEqual({
      version: '59.6.3',
      runtime: 'node',
      manager: 'package-manager',
      canSwitchVersions: false,
      packageManager: 'npm',
      packageManagerAssumed: true,
      global: true,
      upgradeCommand: 'npm i -g vercel@latest',
    });
    expect(describeManager(context)).toBe(
      'package manager (assumed npm, global)'
    );
  });
});

describe('package manager install commands', () => {
  it('rewrites the detected upgrade command to a specific version', () => {
    expect(
      getPackageManagerInstallCommand(
        {
          version: '59.6.3',
          runtime: 'native',
          manager: 'package-manager',
          canSwitchVersions: false,
          packageManager: 'npm',
          packageManagerAssumed: false,
          global: true,
          upgradeCommand: 'npm i -g @vercel/vc-native@latest --force',
        },
        '58.0.0'
      )
    ).toBe('npm i -g @vercel/vc-native@58.0.0 --force');
  });

  it('exports the installer command', () => {
    expect(CURL_INSTALL_COMMAND).toContain('install');
  });
});
