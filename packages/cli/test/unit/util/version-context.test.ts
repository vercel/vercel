import { afterEach, describe, expect, it, vi } from 'vitest';
import { join, sep } from 'path';

const {
  mockIsNative,
  mockIsCurlInstall,
  mockGetInstallRoot,
  mockReadNativeInstallState,
  mockGetUpdateCommandInfo,
  mockIsHomebrewInstall,
} = vi.hoisted(() => ({
  mockIsNative: vi.fn(),
  mockIsCurlInstall: vi.fn(),
  mockGetInstallRoot: vi.fn(),
  mockReadNativeInstallState: vi.fn(),
  mockGetUpdateCommandInfo: vi.fn(),
  mockIsHomebrewInstall: vi.fn(async () => false),
}));

vi.mock('../../../src/util/native-install', () => ({
  isNativeBinaryInstall: () => mockIsNative(),
  getInstallRoot: () => mockGetInstallRoot(),
}));

vi.mock('../../../src/util/native-self-update', () => ({
  CURL_INSTALL_COMMAND:
    'curl -fsSL https://api-frameworks.vercel.sh/install | bash',
  isCurlInstall: () => mockIsCurlInstall(),
  readNativeInstallState: (root: string) => mockReadNativeInstallState(root),
}));

vi.mock('../../../src/util/get-update-command', () => ({
  getUpdateCommandInfo: () => mockGetUpdateCommandInfo(),
  isHomebrewInstall: () => mockIsHomebrewInstall(),
  HOMEBREW_UPGRADE_COMMAND: 'brew upgrade vercel',
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

  it.each([
    false,
    true,
  ])('preserves a recognized unsupported manager for inspection (native: %s)', async native => {
    mockIsNative.mockReturnValue(native);
    mockIsCurlInstall.mockResolvedValue(false);
    const error = new Error(
      'Update Vercel CLI with the package manager that installed it.'
    );
    mockGetUpdateCommandInfo.mockRejectedValueOnce(error);

    const context = await getVersionContext();

    expect(context).toEqual({
      version: '59.6.3',
      runtime: native ? 'native' : 'node',
      manager: 'package-manager',
      canSwitchVersions: false,
      packageManager: undefined,
      packageManagerAssumed: false,
      global: undefined,
      upgradeCommand: undefined,
      upgradeError: error,
    });
    expect(describeManager(context)).toBe(
      'package manager (unsupported installation)'
    );
    expect(isInstallerManaged(context)).toBe(false);
    expect(isPackageManagerManaged(context)).toBe(true);
    if (!isPackageManagerManaged(context)) {
      throw new Error('expected package-manager context');
    }
    expect(() => getPackageManagerInstallCommand(context)).toThrow(error);
    expect(() => getPackageManagerInstallCommand(context, '58.0.0')).toThrow(
      error
    );
  });

  it('describes an installer-managed native binary', async () => {
    mockIsNative.mockReturnValue(true);
    mockIsCurlInstall.mockResolvedValue(true);
    mockGetInstallRoot.mockReturnValue(installRoot);
    mockReadNativeInstallState.mockResolvedValue({
      track: 'production',
      slot: 'a',
      version: '59.6.3',
    });

    const context = await getVersionContext();

    expect(context).toEqual({
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
    });
    expect(isInstallerManaged(context)).toBe(true);
    expect(describeRuntime(context)).toBe('native binary');
    expect(describeManager(context)).toBe(`Vercel installer (${installRoot})`);
    expect(mockGetUpdateCommandInfo).not.toHaveBeenCalled();
  });

  it('includes track, slot, pending release, and PR build details', async () => {
    mockIsNative.mockReturnValue(true);
    mockIsCurlInstall.mockResolvedValue(true);
    mockGetInstallRoot.mockReturnValue(installRoot);
    mockReadNativeInstallState.mockResolvedValue({
      track: 'pr',
      slot: 'b',
      version: 'pr/115',
      pr: 115,
      buildSha: 'a'.repeat(40),
      pendingProduction: { slot: 'b', version: '60.0.0' },
    });

    const context = await getVersionContext();

    expect(context.manager).toBe('installer');
    if (context.manager !== 'installer') {
      throw new Error('expected installer context');
    }
    expect(context).toMatchObject({
      track: 'pr',
      slot: 'b',
      activeVersion: 'pr/115',
      pendingProduction: { slot: 'b', version: '60.0.0' },
      prBuild: { number: 115, sha: 'a'.repeat(40) },
    });
  });

  it('describes a package-manager-installed native binary', async () => {
    mockIsNative.mockReturnValue(true);
    mockIsCurlInstall.mockResolvedValue(false);
    mockGetUpdateCommandInfo.mockResolvedValue({
      command: 'npm i -g vercel@latest',
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
      upgradeCommand: 'npm i -g vercel@latest',
    });
    expect(isPackageManagerManaged(context)).toBe(true);
    expect(describeRuntime(context)).toBe('native binary');
    expect(describeManager(context)).toBe('package manager (npm, global)');
  });

  it('describes a Homebrew cask install without npm-style detection', async () => {
    mockIsNative.mockReturnValue(true);
    mockIsCurlInstall.mockResolvedValue(false);
    mockIsHomebrewInstall.mockResolvedValueOnce(true);

    const context = await getVersionContext();

    expect(context).toEqual({
      version: '59.6.3',
      runtime: 'native',
      manager: 'package-manager',
      canSwitchVersions: false,
      packageManager: 'homebrew',
      packageManagerAssumed: false,
      global: true,
      upgradeCommand: 'brew upgrade vercel',
    });
    expect(describeManager(context)).toBe('Homebrew');
    expect(mockGetUpdateCommandInfo).not.toHaveBeenCalled();
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

  it('does not assume npm when package-manager detection fails', async () => {
    mockIsNative.mockReturnValue(false);
    mockIsCurlInstall.mockResolvedValue(false);
    mockGetUpdateCommandInfo.mockRejectedValue(new Error('no package manager'));

    const context = await getVersionContext();

    expect(context).toEqual({
      version: '59.6.3',
      runtime: 'node',
      manager: 'package-manager',
      canSwitchVersions: false,
      packageManager: undefined,
      packageManagerAssumed: false,
      global: undefined,
      upgradeCommand: undefined,
      upgradeError: expect.any(Error),
    });
    expect(describeManager(context)).toBe(
      'package manager (unsupported installation)'
    );
  });
});

describe('package manager install commands', () => {
  it('rewrites the vercel upgrade command to a specific version for a native runtime', () => {
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
          upgradeCommand: 'npm i -g vercel@latest',
        },
        '58.0.0'
      )
    ).toBe('npm i -g vercel@58.0.0');
  });

  it('exports the installer command', () => {
    expect(CURL_INSTALL_COMMAND).toContain('install');
  });
});
