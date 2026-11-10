import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join, sep } from 'path';

const { mockExecFile, mockIsNative } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockIsNative: vi.fn(),
}));

vi.mock('child_process', () => ({
  // The packaged native runtime wraps execFile without Node's promisify
  // metadata. Exercise its callback API rather than mocking a custom promise.
  execFile: (
    file: string,
    args: string[],
    options: object,
    callback: (error: Error | null, stdout?: string, stderr?: string) => void
  ) => {
    mockExecFile(file, args, options).then(
      ({ stdout, stderr }: { stdout: string; stderr: string }) =>
        callback(null, stdout, stderr),
      (error: Error) => callback(error)
    );
  },
}));

vi.mock('fs-extra', () => ({ realpath: vi.fn() }));
vi.mock('../../../src/util/native-install', () => ({
  isNativeBinaryInstall: () => mockIsNative(),
}));
vi.mock('../../../src/util/pkg-name', () => ({ packageName: 'vercel' }));

import getUpdateCommand, {
  getUpdateCommandInfo,
  HomebrewInstallError,
  isGlobal,
  isHomebrewInstall,
} from '../../../src/util/get-update-command';
import {
  trustedUpgradeDirectory,
  trustedUpgradeEnvironment,
} from '../../../src/util/upgrade-environment';
import { realpath } from 'fs-extra';

const realpathMock = vi.mocked(realpath);

describe('getUpdateCommandInfo install detection', () => {
  const originalArgv = process.argv;
  const originalExecPath = process.execPath;

  beforeEach(() => {
    vi.resetAllMocks();
    process.argv = ['/usr/bin/node', '/install/vercel/dist/vc.js'];
    mockIsNative.mockReturnValue(false);
    mockExecFile.mockRejectedValue(new Error('not installed'));
    realpathMock.mockImplementation(async (path: any) => String(path));
  });

  afterEach(() => {
    process.argv = originalArgv;
    Object.defineProperty(process, 'execPath', { value: originalExecPath });
  });

  it.each([
    {
      manager: 'npm',
      output: `${join(sep, 'global', 'npm')}\n`,
      installPath: join(sep, 'global', 'npm', 'vercel', 'dist', 'vc.js'),
      command: 'npm i -g vercel@latest',
    },
    {
      manager: 'pnpm',
      output: JSON.stringify([
        {
          dependencies: {
            vercel: { path: join(sep, 'global', 'pnpm', 'vercel') },
          },
        },
      ]),
      installPath: join(sep, 'global', 'pnpm', 'vercel', 'dist', 'vc.js'),
      command: 'pnpm i -g vercel@latest --allow-build=esbuild',
    },
    {
      manager: 'yarn',
      output: `${join(sep, 'global', 'yarn')}\n`,
      installPath: join(
        sep,
        'global',
        'yarn',
        'node_modules',
        'vercel',
        'dist',
        'vc.js'
      ),
      command: 'yarn global add vercel@latest',
    },
  ])('uses positive $manager global-package detection', async ({
    manager,
    output,
    installPath,
    command,
  }) => {
    process.argv[1] = installPath;
    mockExecFile.mockImplementation(async file => {
      if (file === manager) return { stdout: output, stderr: '' };
      throw new Error('not installed');
    });

    await expect(getUpdateCommandInfo()).resolves.toEqual({
      command,
      global: true,
      packageManager: manager,
      assumed: false,
    });
  });

  it('uses positive Bun global-binary detection', async () => {
    const binRoot = join(sep, 'global', 'bun', 'bin');
    const installPath = join(sep, 'global', 'bun', 'vercel', 'dist', 'vc.js');
    process.argv[1] = installPath;
    mockExecFile.mockImplementation(async file => {
      if (file === 'bun') return { stdout: `${binRoot}\n`, stderr: '' };
      throw new Error('not installed');
    });
    realpathMock.mockImplementation(async (path: any) =>
      String(path) === join(binRoot, 'vercel') ? installPath : String(path)
    );

    await expect(getUpdateCommandInfo()).resolves.toEqual({
      command: 'bun add -g vercel@latest',
      global: true,
      packageManager: 'bun',
      assumed: false,
    });
  });

  it('does not infer Bun from a path containing bun', async () => {
    process.argv[1] = join(
      sep,
      'home',
      'bun',
      'project',
      'node_modules',
      'vercel',
      'dist',
      'vc.js'
    );

    await expect(getUpdateCommandInfo()).rejects.toThrow(
      'Could not detect a supported global npm, pnpm, Yarn, or Bun installation'
    );
  });

  it('rejects a local package-manager installation instead of producing a local command', async () => {
    process.argv[1] = join(
      sep,
      'project',
      'node_modules',
      'vercel',
      'dist',
      'vc.js'
    );

    await expect(getUpdateCommandInfo()).rejects.toThrow(
      'Update it with the package manager that installed it.'
    );
  });

  it('uses the startup environment instead of later process mutations', async () => {
    const installPath = join(sep, 'global', 'npm', 'vercel', 'dist', 'vc.js');
    process.argv[1] = installPath;
    const originalPath = process.env.PATH;
    const originalTmpdir = process.env.TMPDIR;
    process.env.PATH = join(sep, 'attacker');
    process.env.TMPDIR = join(sep, 'attacker', 'project');
    process.env.VERCEL_UPGRADE_NPM_COMMAND = join(sep, 'attacker', 'run');
    mockExecFile.mockImplementation(async file => {
      if (file === 'npm') {
        return { stdout: `${join(sep, 'global', 'npm')}\n`, stderr: '' };
      }
      throw new Error('not installed');
    });

    try {
      await expect(getUpdateCommandInfo()).resolves.toMatchObject({
        packageManager: 'npm',
      });
      const npmCall = mockExecFile.mock.calls.find(([file]) => file === 'npm');
      expect(npmCall?.[2]).toEqual(
        expect.objectContaining({
          cwd: trustedUpgradeDirectory,
          env: trustedUpgradeEnvironment,
        })
      );
      expect(npmCall?.[2]?.env).not.toBe(process.env);
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      if (originalTmpdir === undefined) {
        delete process.env.TMPDIR;
      } else {
        process.env.TMPDIR = originalTmpdir;
      }
      delete process.env.VERCEL_UPGRADE_NPM_COMMAND;
    }
  });

  it('gives native subprocess wrappers fresh mutable copies of the startup environment', async () => {
    const installPath = join(sep, 'global', 'vercel', 'dist', 'vc.js');
    process.argv[1] = installPath;
    mockExecFile.mockImplementation(async (file, _args, { env }) => {
      expect(env).not.toBe(trustedUpgradeEnvironment);
      expect(env.PKG_EXECPATH).toBe(trustedUpgradeEnvironment.PKG_EXECPATH);
      // Model the native packager's child_process wrapper.
      env.PKG_EXECPATH = 'native-runtime';
      if (file === 'pnpm') {
        return {
          stdout: JSON.stringify([
            {
              dependencies: { vercel: { path: join(sep, 'global', 'vercel') } },
            },
          ]),
          stderr: '',
        };
      }
      throw new Error('not installed');
    });

    await expect(getUpdateCommandInfo()).resolves.toMatchObject({
      packageManager: 'pnpm',
      command: 'pnpm i -g vercel@latest --allow-build=esbuild',
    });
    expect(mockExecFile).toHaveBeenCalledTimes(2);
    expect(Object.isFrozen(trustedUpgradeEnvironment)).toBe(true);
  });

  it('rejects unknown installs instead of assuming global npm', async () => {
    process.argv[1] = join(sep, 'unknown', 'vercel', 'dist', 'vc.js');

    await expect(getUpdateCommandInfo()).rejects.toThrow(
      'Could not detect a supported global npm, pnpm, Yarn, or Bun installation'
    );
    expect(mockExecFile).toHaveBeenCalledWith(
      'npm',
      ['root', '-g'],
      expect.any(Object)
    );
  });

  it('passes cancellation through to package-manager detection', async () => {
    const controller = new AbortController();
    mockExecFile.mockImplementation(
      (_file, _args, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        })
    );

    const context = getUpdateCommandInfo(undefined, controller.signal);
    const rejection = expect(context).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(mockExecFile).toHaveBeenCalledOnce());
    controller.abort(new Error('cancelled'));

    await rejection;
    expect(mockExecFile).toHaveBeenCalledWith(
      'npm',
      ['root', '-g'],
      expect.objectContaining({ signal: controller.signal })
    );
  });

  it.each([
    'npm',
    'pnpm',
    'yarn',
    'bun',
  ] as const)('upgrades vercel through %s when its launcher uses a separate native package', async manager => {
    mockIsNative.mockReturnValue(true);
    const root = join(sep, 'global', manager);
    const packageRoot =
      manager === 'pnpm'
        ? join(sep, 'store', 'links', 'vercel', 'node_modules', 'vercel')
        : join(root, 'node_modules', 'vercel');
    const entrypoint = join(packageRoot, 'dist', 'vc.js');
    const nativeExecutable = join(
      root,
      'node_modules',
      '@vercel',
      'vc-native-darwin-arm64',
      'bin',
      'vercel'
    );
    const resolvedNativeExecutable = join(sep, 'native-store', manager, 'vc');
    process.argv[1] = join(sep, 'snapshot', 'vercel', 'vc.js');
    Object.defineProperty(process, 'execPath', {
      value: resolvedNativeExecutable,
    });
    const output = {
      npm: join(root, 'node_modules'),
      pnpm: JSON.stringify([
        { dependencies: { vercel: { path: packageRoot } } },
      ]),
      yarn: root,
      bun: join(root, 'bin'),
    }[manager];
    mockExecFile.mockImplementation(async file => {
      if (file === manager) return { stdout: `${output}\n`, stderr: '' };
      throw new Error('not installed');
    });
    realpathMock.mockImplementation(async (path: any) => {
      if (String(path) === nativeExecutable) return resolvedNativeExecutable;
      if (String(path) === join(root, 'bin', 'vercel')) return entrypoint;
      return String(path);
    });

    const info = await getUpdateCommandInfo({
      ...trustedUpgradeEnvironment,
      VERCEL_CLI_PACKAGE_ENTRYPOINT: entrypoint,
      VERCEL_CLI_PACKAGE_EXECUTABLE: nativeExecutable,
    });
    const commands = {
      npm: 'npm i -g vercel@latest',
      pnpm: 'pnpm i -g vercel@latest --allow-build=esbuild',
      yarn: 'yarn global add vercel@latest',
      bun: 'bun add -g vercel@latest',
    };
    expect(info).toEqual({
      command: commands[manager],
      global: true,
      packageManager: manager,
      assumed: false,
    });
    expect(info.command).not.toContain('@vercel/vc-native');
    expect(info.command).not.toContain('--force');
    expect(realpathMock).not.toHaveBeenCalledWith(process.argv[1]);
    if (manager === 'pnpm') {
      expect(mockExecFile).toHaveBeenCalledWith(
        'pnpm',
        ['list', '-g', 'vercel', '--depth=0', '--json'],
        expect.any(Object)
      );
    }
  });

  it('does not treat a local native launcher as a global vercel installation', async () => {
    mockIsNative.mockReturnValue(true);
    mockExecFile.mockImplementation(async file => {
      if (file === 'npm') {
        return { stdout: join(sep, 'global', 'node_modules'), stderr: '' };
      }
      throw new Error('not installed');
    });

    await expect(
      getUpdateCommandInfo({
        ...trustedUpgradeEnvironment,
        VERCEL_CLI_PACKAGE_EXECUTABLE: process.execPath,
        VERCEL_CLI_PACKAGE_ENTRYPOINT: join(
          sep,
          'project',
          'node_modules',
          'vercel',
          'dist',
          'vc.js'
        ),
      })
    ).rejects.toThrow('Could not detect a supported global');
  });

  it('rejects native installs without a vercel launcher instead of upgrading the legacy wrapper', async () => {
    mockIsNative.mockReturnValue(true);
    Object.defineProperty(process, 'execPath', {
      value: join(sep, 'global', '@vercel', 'vc-native', 'bin', 'vercel'),
    });
    realpathMock.mockRejectedValue(new Error('snapshot path'));

    await expect(
      getUpdateCommandInfo({
        ...trustedUpgradeEnvironment,
        VERCEL_CLI_PACKAGE_ENTRYPOINT: undefined,
        VERCEL_CLI_PACKAGE_EXECUTABLE: undefined,
      })
    ).rejects.toThrow('Could not resolve this Vercel CLI installation');
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('does not use an entrypoint introduced after startup', async () => {
    mockIsNative.mockReturnValue(true);
    const entrypoint = join(sep, 'global', 'vercel', 'dist', 'vc.js');
    vi.stubEnv('VERCEL_CLI_PACKAGE_ENTRYPOINT', entrypoint);
    vi.stubEnv('VERCEL_CLI_PACKAGE_EXECUTABLE', process.execPath);
    realpathMock.mockImplementation(async (path: any) => {
      if (String(path) === process.argv[1]) throw new Error('snapshot path');
      return String(path);
    });
    mockExecFile.mockResolvedValue({ stdout: join(sep, 'global'), stderr: '' });

    try {
      await expect(getUpdateCommandInfo()).rejects.toThrow(
        'Could not resolve this Vercel CLI installation'
      );
      expect(mockExecFile).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('does not upgrade the parent installation when a child Node CLI inherits native markers', async () => {
    mockIsNative.mockReturnValue(true);
    const parentEntrypoint = join(sep, 'global', 'vercel', 'dist', 'vc.js');
    const parentExecutable = join(
      sep,
      'global',
      '@vercel',
      'vc-native-darwin-arm64',
      'bin',
      'vercel'
    );
    mockExecFile.mockImplementation(async file => {
      if (file === 'npm') return { stdout: join(sep, 'global'), stderr: '' };
      throw new Error('not installed');
    });

    await expect(
      getUpdateCommandInfo({
        ...trustedUpgradeEnvironment,
        VERCEL_CLI_PACKAGE_ENTRYPOINT: parentEntrypoint,
        VERCEL_CLI_PACKAGE_EXECUTABLE: parentExecutable,
      })
    ).rejects.toThrow('Could not detect a supported global');
    expect(realpathMock).not.toHaveBeenCalledWith(parentEntrypoint);
    expect(realpathMock).toHaveBeenCalledWith(process.argv[1]);
  });

  it('ignores the native launcher environment when running in Node', async () => {
    const entrypoint = join(sep, 'global', 'vercel', 'dist', 'vc.js');
    mockExecFile.mockImplementation(async file => {
      if (file === 'npm') return { stdout: join(sep, 'global'), stderr: '' };
      throw new Error('not installed');
    });

    await expect(
      getUpdateCommandInfo({
        ...trustedUpgradeEnvironment,
        VERCEL_CLI_PACKAGE_ENTRYPOINT: entrypoint,
      })
    ).rejects.toThrow('Could not detect a supported global');
  });
});

describe('Homebrew cask detection', () => {
  const originalExecPath = process.execPath;
  const caskBinary = join(
    sep,
    'opt',
    'homebrew',
    'Caskroom',
    'vercel',
    '64.0.2',
    'package',
    'bin',
    'vercel'
  );
  const brewLink = join(sep, 'opt', 'homebrew', 'bin', 'vc');

  beforeEach(() => {
    vi.resetAllMocks();
    mockIsNative.mockReturnValue(true);
    mockExecFile.mockRejectedValue(new Error('not installed'));
    realpathMock.mockImplementation(async (path: any) =>
      String(path) === brewLink ? caskBinary : String(path)
    );
  });

  afterEach(() => {
    Object.defineProperty(process, 'execPath', { value: originalExecPath });
  });

  it('detects the native binary through the Homebrew bin symlink', async () => {
    Object.defineProperty(process, 'execPath', { value: brewLink });

    await expect(isHomebrewInstall()).resolves.toBe(true);
    await expect(getUpdateCommand()).resolves.toBe('brew upgrade vercel');
    await expect(isGlobal()).resolves.toBe(true);
    await expect(getUpdateCommandInfo()).rejects.toThrow(HomebrewInstallError);
    await expect(getUpdateCommandInfo()).rejects.toThrow(
      'This Vercel CLI was installed with Homebrew. Update it with `brew upgrade vercel`.'
    );
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('detects the cask path when realpath is unavailable', async () => {
    Object.defineProperty(process, 'execPath', { value: caskBinary });
    realpathMock.mockRejectedValue(new Error('snapshot path'));

    await expect(isHomebrewInstall()).resolves.toBe(true);
  });

  it('ignores Caskroom paths for the Node.js CLI', async () => {
    mockIsNative.mockReturnValue(false);
    Object.defineProperty(process, 'execPath', { value: caskBinary });

    await expect(isHomebrewInstall()).resolves.toBe(false);
  });

  it('ignores other casks and package-manager installs', async () => {
    for (const execPath of [
      join(sep, 'opt', 'homebrew', 'Caskroom', 'vercel-beta', 'bin', 'vercel'),
      join(sep, 'global', '@vercel', 'vc-native-darwin-arm64', 'bin', 'vercel'),
    ]) {
      Object.defineProperty(process, 'execPath', { value: execPath });
      await expect(isHomebrewInstall()).resolves.toBe(false);
    }
  });
});
