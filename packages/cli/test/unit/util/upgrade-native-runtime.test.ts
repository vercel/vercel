import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  execFile,
  spawn,
  type ChildProcess,
  type ExecFileOptions,
  type SpawnOptions,
} from 'node:child_process';
import { executeUpgrade } from '../../../src/util/upgrade';
import { getUpdateCommandInfo } from '../../../src/util/get-update-command';
import { trustedUpgradeEnvironment } from '../../../src/util/upgrade-environment';

vi.mock('child_process', () => ({ execFile: vi.fn(), spawn: vi.fn() }));
vi.mock('../../../src/util/get-update-command', () => ({
  getUpdateCommandInfo: vi.fn(),
}));
vi.mock('../../../src/util/pkg', () => ({
  default: { name: 'vercel', version: '63.0.0' },
}));
vi.mock('../../../src/util/config/files', () => ({
  writeToConfigFile: vi.fn(),
}));
vi.mock('../../../src/output-manager', () => ({
  default: {
    spinner: vi.fn(),
    stopSpinner: vi.fn(),
    log: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    print: vi.fn(),
  },
}));

function addNativeRuntimeEnvironment(env: NodeJS.ProcessEnv) {
  expect(env).not.toBe(trustedUpgradeEnvironment);
  expect(env).toEqual(trustedUpgradeEnvironment);
  // The native packager mutates options.env before starting the child.
  env.PKG_EXECPATH = 'native-runtime';
}

describe('upgrades with native child_process wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUpdateCommandInfo).mockResolvedValue({
      command: 'npm i -g vercel@latest',
      global: true,
      packageManager: 'npm',
      assumed: false,
    });
  });

  it('lets metadata queries mutate their own environment without thawing the startup snapshot', async () => {
    const originalPkgExecPath = trustedUpgradeEnvironment.PKG_EXECPATH;
    vi.mocked(execFile).mockImplementationOnce(((
      _command: string,
      _args: string[],
      options: ExecFileOptions,
      callback: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      addNativeRuntimeEnvironment(options.env!);
      callback(null, '"63.0.0"\n', '');
      return new EventEmitter() as ChildProcess;
    }) as typeof execFile);

    await expect(executeUpgrade()).resolves.toBe(0);
    expect(execFile).toHaveBeenCalledOnce();
    expect(spawn).not.toHaveBeenCalled();
    expect(trustedUpgradeEnvironment.PKG_EXECPATH).toBe(originalPkgExecPath);
    expect(Object.isFrozen(trustedUpgradeEnvironment)).toBe(true);
  });

  it('lets the installer mutate its own environment without thawing the startup snapshot', async () => {
    const originalPkgExecPath = trustedUpgradeEnvironment.PKG_EXECPATH;
    vi.mocked(spawn).mockImplementationOnce(((
      _command: string,
      _args: string[],
      options: SpawnOptions
    ) => {
      addNativeRuntimeEnvironment(options.env!);
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('close', 0));
      return child as ChildProcess;
    }) as typeof spawn);

    await expect(executeUpgrade('63.0.1')).resolves.toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      'npm',
      ['i', '-g', 'vercel@63.0.1'],
      expect.any(Object)
    );
    expect(execFile).not.toHaveBeenCalled();
    expect(trustedUpgradeEnvironment.PKG_EXECPATH).toBe(originalPkgExecPath);
    expect(Object.isFrozen(trustedUpgradeEnvironment)).toBe(true);
  });
});
