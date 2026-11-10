import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { tmpdir } from 'os';
import { spawn, execFile } from 'child_process';
import output from '../../../src/output-manager';
import {
  executeAutomaticUpgrade,
  executeHomebrewUpgrade,
  executeUpgrade,
  parseVersionOutput,
} from '../../../src/util/upgrade';
import { getUpdateCommandInfo } from '../../../src/util/get-update-command';
import { trustedUpgradeEnvironment } from '../../../src/util/upgrade-environment';
import pkg from '../../../src/util/pkg';
import { client } from '../../mocks/client';
import * as configFilesUtil from '../../../src/util/config/files';

describe('parseVersionOutput', () => {
  it.each([
    '"1.2.3"',
    '["1.2.3"]',
    '[\n  "1.2.3"\n]',
    '{"type":"inspect","data":"1.2.3"}',
    '1.2.3',
  ])('parses supported metadata output %s', stdout => {
    expect(parseVersionOutput(stdout)).toBe('1.2.3');
  });
  it.each([
    '[]',
    '["1.0.0","2.0.0"]',
    'not a version',
  ])('rejects ambiguous or invalid metadata %s', stdout => {
    expect(parseVersionOutput(stdout)).toBeUndefined();
  });
});

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFile: vi.fn(),
}));

// Mock output-manager
vi.mock('../../../src/output-manager', () => ({
  default: {
    initialize: vi.fn(),
    log: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    print: vi.fn(),
    spinner: vi.fn(),
    stopSpinner: vi.fn(),
  },
}));

// Mock get-update-command
vi.mock('../../../src/util/get-update-command', () => ({
  getUpdateCommandInfo: vi.fn().mockResolvedValue({
    command: 'npm i -g vercel@latest',
    global: true,
    packageManager: 'npm',
    assumed: false,
  }),
  HOMEBREW_UPGRADE_COMMAND: 'brew upgrade vercel',
}));

const spawnMock = vi.mocked(spawn);
const execFileMock = vi.mocked(execFile);
const outputMock = vi.mocked(output);
const getUpdateCommandInfoMock = vi.mocked(getUpdateCommandInfo);
const writeConfigSpy = vi.spyOn(configFilesUtil, 'writeToConfigFile');

// Makes the package manager's `latest` lookup resolve to `version`.
function mockLatestVersion(version: string) {
  execFileMock.mockImplementation(((
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout?: string, stderr?: string) => void
  ) => {
    const callback = typeof _opts === 'function' ? (_opts as typeof cb) : cb;
    callback(
      null,
      `${JSON.stringify(_args[0] === 'config' ? null : _args[0] === '--version' ? '11.10.0' : version)}\n`,
      ''
    );
    return {} as any;
  }) as any);
}

describe('executeUpgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.mockReset();
    execFileMock.mockReset();
    client.config = {};
    client.nonInteractive = false;
    client.stdin.isTTY = true;
    client.input.select = vi.fn().mockResolvedValue('cancel');
    client.input.confirm = vi.fn();
    writeConfigSpy.mockImplementation(() => undefined);
    // Default to a newer release so tests reach the installer.
    mockLatestVersion('999.0.0');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  function createMockProcess() {
    const proc = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    return proc;
  }

  // Helper to wait for async operations to complete
  const tick = () => new Promise(resolve => setImmediate(resolve));

  it('shows bounded progress and hides package manager output on upgrade', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();

    // Wait for getUpdateCommand to resolve and spawn to be called
    await tick();

    // Simulate some output
    mockProcess.stdout.emit('data', Buffer.from('Installing packages...'));
    mockProcess.stderr.emit('data', Buffer.from('npm WARN deprecated'));

    // Simulate successful exit
    mockProcess.emit('close', 0);

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(outputMock.success).toHaveBeenCalledWith(
      'Upgraded Vercel CLI to v999.0.0.'
    );
    expect(outputMock.spinner).toHaveBeenNthCalledWith(
      1,
      'Upgrading Vercel CLI [--------------------] (0/3) Resolving installer…',
      0
    );
    expect(outputMock.spinner).toHaveBeenNthCalledWith(
      2,
      'Upgrading Vercel CLI [======--------------] (1/3) Checking for updates…',
      0
    );
    expect(outputMock.spinner).toHaveBeenNthCalledWith(
      3,
      'Upgrading Vercel CLI [=============-------] (2/3) Installing…',
      0
    );
    expect(outputMock.spinner).toHaveBeenNthCalledWith(
      4,
      'Upgrading Vercel CLI [====================] (3/3)',
      0
    );
    expect(outputMock.stopSpinner).toHaveBeenCalled();
    // Output should NOT be printed on success
    expect(outputMock.print).not.toHaveBeenCalled();
  });

  it('fails instead of installing latest when version resolution fails', async () => {
    execFileMock.mockImplementationOnce(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null) => void
    ) => {
      const callback = typeof _opts === 'function' ? (_opts as typeof cb) : cb;
      callback(new Error('registry unavailable'));
      return {} as any;
    }) as any);

    const exitCode = await executeUpgrade();

    expect(exitCode).toBe(1);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(outputMock.error).toHaveBeenCalledWith(
      'Failed to resolve the latest Vercel CLI version.'
    );
  });

  it('stops progress when installer resolution fails', async () => {
    getUpdateCommandInfoMock.mockRejectedValueOnce(
      new Error('Could not resolve installer')
    );

    await expect(executeUpgrade()).rejects.toThrow(
      'Could not resolve installer'
    );

    expect(outputMock.stopSpinner).toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('installs an explicit version even when it is a downgrade', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade('0.0.1', undefined, false, true);
    await tick();

    mockProcess.emit('close', 0);

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(outputMock.success).toHaveBeenCalledWith(
      'Upgraded Vercel CLI to v0.0.1.'
    );
    expect(outputMock.spinner).toHaveBeenNthCalledWith(
      1,
      'Upgrading Vercel CLI [--------------------] (0/2) Resolving installer…',
      0
    );
    expect(outputMock.spinner).toHaveBeenNthCalledWith(
      2,
      'Upgrading Vercel CLI [==========----------] (1/2) Installing…',
      0
    );
    expect(outputMock.spinner).toHaveBeenNthCalledWith(
      3,
      'Upgrading Vercel CLI [====================] (2/2)',
      0
    );
    expect(outputMock.spinner).toHaveBeenCalledTimes(3);
    expect(execFileMock).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledWith(
      'npm',
      ['i', '-g', 'vercel@0.0.1'],
      expect.any(Object)
    );
  });

  it('installs an explicit latest tag without resolving or pinning it', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade('latest', undefined, false, true);
    await tick();
    mockProcess.emit('close', 0);

    await expect(exitCodePromise).resolves.toBe(0);
    expect(execFileMock).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledWith(
      'npm',
      ['i', '-g', 'vercel@latest'],
      expect.any(Object)
    );
    expect(outputMock.success).toHaveBeenCalledWith('Upgraded Vercel CLI.');
  });

  it('reports no upgrade available when the version did not change', async () => {
    mockLatestVersion(pkg.version);

    const exitCode = await executeUpgrade();

    expect(exitCode).toBe(0);
    expect(execFileMock).toHaveBeenCalledWith(
      'npm',
      [
        'view',
        'vercel@latest',
        'version',
        '--json',
        '--global',
        '--min-release-age=0',
      ],
      expect.objectContaining({ encoding: 'utf8', cwd: tmpdir() }),
      expect.any(Function)
    );
    expect(spawnMock).not.toHaveBeenCalled();
    expect(outputMock.success).not.toHaveBeenCalled();
    expect(outputMock.log).toHaveBeenCalledWith(
      `No upgrade available. Vercel CLI is already up to date (v${pkg.version}).`
    );
  });

  it.each([
    pkg.version,
    '0.0.1',
  ])('saves explicit bypass consent when no install is needed (%s)', async version => {
    mockLatestVersion(version);
    await expect(executeUpgrade(undefined, client, true)).resolves.toBe(0);
    expect(client.config.updates?.bypassMinReleaseAge).toBe(true);
    expect(writeConfigSpy).toHaveBeenCalledTimes(1);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it.each([
    'bun',
    'yarn',
  ] as const)('rejects unsupported explicit bypass for %s before mutation', async packageManager => {
    getUpdateCommandInfoMock.mockResolvedValueOnce({
      command: `${packageManager} add -g vercel@latest`,
      global: true,
      packageManager,
      assumed: false,
    });
    await expect(executeUpgrade(undefined, client, true)).resolves.toBe(1);
    expect(writeConfigSpy).not.toHaveBeenCalled();
    expect(execFileMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(outputMock.error).toHaveBeenCalledWith(
      expect.stringContaining(`not supported for ${packageManager}`)
    );
  });

  it('does not downgrade when the running version is newer than latest', async () => {
    mockLatestVersion('0.0.1');

    const exitCode = await executeUpgrade();

    expect(exitCode).toBe(0);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(outputMock.success).not.toHaveBeenCalled();
    expect(outputMock.log).toHaveBeenCalledWith(
      `No upgrade available. Vercel CLI is already up to date (v${pkg.version}).`
    );
  });

  it('reports the new version when the install upgraded the CLI', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);
    mockLatestVersion('999.0.0');

    const exitCodePromise = executeUpgrade();
    await tick();

    mockProcess.emit('close', 0);

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(outputMock.success).toHaveBeenCalledWith(
      'Upgraded Vercel CLI to v999.0.0.'
    );
  });

  it('should show captured output and error message on failed upgrade', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();
    await tick();

    // Simulate some output
    mockProcess.stdout.emit('data', Buffer.from('Installing packages...'));
    mockProcess.stderr.emit('data', Buffer.from('npm ERR! code EACCES'));

    // Simulate failed exit
    mockProcess.emit('close', 1);

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(1);
    expect(outputMock.success).not.toHaveBeenCalled();
    // Output SHOULD be printed on error
    expect(outputMock.print).toHaveBeenCalledWith('Installing packages...');
    expect(outputMock.print).toHaveBeenCalledWith('npm ERR! code EACCES');
    expect(outputMock.error).toHaveBeenCalledWith(
      'Upgrade failed with exit code 1'
    );
    expect(outputMock.log).toHaveBeenCalledWith(
      'You can try running the command manually: npm i -g vercel@999.0.0'
    );
    expect(outputMock.stopSpinner).toHaveBeenCalled();
  });

  it('should handle spawn errors', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();
    await tick();

    // Simulate spawn error
    mockProcess.emit('error', new Error('Command not found'));

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(1);
    expect(outputMock.error).toHaveBeenCalledWith(
      'Failed to execute upgrade command: Command not found'
    );
    expect(outputMock.log).toHaveBeenCalledWith(
      'You can try running the command manually: npm i -g vercel@999.0.0'
    );
    expect(outputMock.stopSpinner).toHaveBeenCalled();
  });

  it('should handle null exit code as error', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();
    await tick();

    // Simulate close with null exit code (e.g., killed by signal)
    mockProcess.emit('close', null);

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(1);
    expect(outputMock.error).toHaveBeenCalledWith(
      'Upgrade failed with exit code 1'
    );
  });

  it('should not print empty stdout/stderr on error', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();
    await tick();

    // Simulate failed exit with no output
    mockProcess.emit('close', 1);

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(1);
    // print should not be called for empty output
    expect(outputMock.print).not.toHaveBeenCalled();
    expect(outputMock.error).toHaveBeenCalledWith(
      'Upgrade failed with exit code 1'
    );
  });

  it('should spawn a global upgrade from a neutral directory', async () => {
    mockLatestVersion('999.0.0');
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();
    await tick();

    mockProcess.emit('close', 0);
    await exitCodePromise;

    expect(spawnMock).toHaveBeenCalledWith(
      'npm',
      ['i', '-g', 'vercel@999.0.0'],
      expect.objectContaining({ cwd: tmpdir() })
    );
  });

  it('installs vercel with bounded progress from a native runtime', async () => {
    vi.stubEnv('VERCEL_VC_NATIVE', '1');
    getUpdateCommandInfoMock.mockResolvedValueOnce({
      command: 'npm i -g vercel@latest',
      global: true,
      packageManager: 'npm',
      assumed: false,
    });
    mockLatestVersion('999.0.0');
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();
    await tick();

    mockProcess.emit('close', 0);
    await exitCodePromise;

    expect(spawnMock).toHaveBeenCalledWith(
      'npm',
      ['i', '-g', 'vercel@999.0.0'],
      {
        cwd: tmpdir(),
        env: trustedUpgradeEnvironment,
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: false,
      }
    );
    expect(outputMock.spinner).toHaveBeenNthCalledWith(
      1,
      'Upgrading Vercel CLI [--------------------] (0/3) Resolving installer…',
      0
    );
    expect(outputMock.spinner).toHaveBeenNthCalledWith(
      2,
      'Upgrading Vercel CLI [======--------------] (1/3) Checking for updates…',
      0
    );
    expect(outputMock.spinner).toHaveBeenNthCalledWith(
      3,
      'Upgrading Vercel CLI [=============-------] (2/3) Installing…',
      0
    );
    expect(outputMock.spinner).toHaveBeenNthCalledWith(
      4,
      'Upgrading Vercel CLI [====================] (3/3)',
      0
    );
    expect(outputMock.stopSpinner).toHaveBeenCalled();
  });

  it('checks vercel for updates from an up-to-date native runtime', async () => {
    vi.stubEnv('VERCEL_VC_NATIVE', '1');
    getUpdateCommandInfoMock.mockResolvedValueOnce({
      command: 'npm i -g vercel@latest',
      global: true,
      packageManager: 'npm',
      assumed: false,
    });
    mockLatestVersion(pkg.version);

    const exitCode = await executeUpgrade();

    expect(exitCode).toBe(0);
    expect(execFileMock).toHaveBeenCalledWith(
      'npm',
      [
        'view',
        'vercel@latest',
        'version',
        '--json',
        '--global',
        '--min-release-age=0',
      ],
      expect.objectContaining({ encoding: 'utf8' }),
      expect.any(Function)
    );
    expect(spawnMock).not.toHaveBeenCalled();
    expect(outputMock.success).not.toHaveBeenCalled();
    expect(outputMock.log).toHaveBeenCalledWith(
      `No upgrade available. Vercel CLI is already up to date (v${pkg.version}).`
    );
  });

  it('lets the package manager resolve latest during automatic upgrades without prompting or bypassing', async () => {
    client.config = {
      updates: { auto: true, bypassMinReleaseAge: true },
    };
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const result = executeAutomaticUpgrade(client);
    await tick();
    mockProcess.emit('close', 0);

    await expect(result).resolves.toBe(0);
    expect(execFileMock).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledWith(
      'npm',
      ['i', '-g', 'vercel@latest'],
      expect.any(Object)
    );
    expect(client.input.select).not.toHaveBeenCalled();
    expect(writeConfigSpy).not.toHaveBeenCalled();
    expect(outputMock.success).toHaveBeenCalledWith('Upgraded Vercel CLI.');
  });

  it('retries npm with a release-age bypass and remembers consent', async () => {
    const first = createMockProcess();
    const second = createMockProcess();
    spawnMock
      .mockReturnValueOnce(first as any)
      .mockReturnValueOnce(second as any);
    client.input.select = vi.fn().mockResolvedValue('bypass');

    const exitCodePromise = executeUpgrade(undefined, client);
    await tick();
    first.stderr.emit(
      'data',
      Buffer.from(
        'npm error code ETARGET\nnpm error notarget No matching version found for vercel@999.0.0 with a date before 2026-09-01.'
      )
    );
    first.emit('close', 1);
    await tick();
    second.emit('close', 0);

    await expect(exitCodePromise).resolves.toBe(0);
    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      'npm',
      ['i', '-g', 'vercel@999.0.0'],
      expect.any(Object)
    );
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      'npm',
      ['i', '-g', 'vercel@999.0.0', '--min-release-age=0'],
      expect.any(Object)
    );
    expect(outputMock.print).toHaveBeenCalledWith(
      '! The package manager blocked this Vercel CLI release because of its minimum release-age setting. npm did not report a configured minimum release age.\n'
    );
    expect(outputMock.warn).not.toHaveBeenCalled();
    expect(outputMock.print).not.toHaveBeenCalledWith(
      expect.stringContaining('WARNING!')
    );
    expect(client.input.confirm).not.toHaveBeenCalled();
    expect(client.input.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Which upgrade option?',
        default: 'allowed',
        choices: [
          {
            name: 'Install the newest release allowed by my settings',
            value: 'allowed',
          },
          {
            name: 'Bypass the minimum release age for this and future foreground upgrades',
            value: 'bypass',
          },
          { name: 'Cancel', value: 'cancel' },
        ],
      })
    );
    expect(writeConfigSpy).toHaveBeenCalledWith({
      updates: { bypassMinReleaseAge: true },
    });
  });

  it.each([
    { packageManager: 'npm' as const, global: true, native: false },
    { packageManager: 'pnpm' as const, global: true, native: false },
    { packageManager: 'npm' as const, global: true, native: true },
    { packageManager: 'pnpm' as const, global: true, native: true },
  ])('installs vercel@latest under $packageManager settings (native=$native, global=$global)', async ({
    packageManager,
    global,
    native,
  }) => {
    vi.stubEnv('VERCEL_VC_NATIVE', native ? '1' : undefined);
    const name = 'vercel';
    const args = [
      'i',
      ...(global ? ['-g'] : []),
      `${name}@latest`,
      ...(packageManager === 'pnpm' ? ['--allow-build=esbuild'] : []),
    ];
    getUpdateCommandInfoMock.mockResolvedValueOnce({
      command: [packageManager, ...args].join(' '),
      packageManager,
      global,
      assumed: false,
    });
    const first = createMockProcess();
    const second = createMockProcess();
    spawnMock
      .mockReturnValueOnce(first as any)
      .mockReturnValueOnce(second as any);
    client.input.select = vi.fn().mockResolvedValue('allowed');

    // A known target also exercises the update-notifier caller without a lookup.
    const result = executeUpgrade('999.0.0', client);
    await tick();
    first.stderr.emit(
      'data',
      Buffer.from(
        packageManager === 'npm'
          ? 'ETARGET No matching version found with a date before 2026-09-01'
          : 'ERR_PNPM_NO_MATCHING_VERSION Version 999.0.0 satisfies the specs but was released at Fri Sep 04 2026'
      )
    );
    first.emit('close', 1);
    await tick();
    expect(execFileMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['list']),
      expect.anything(),
      expect.anything()
    );
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      packageManager,
      args,
      expect.objectContaining({ cwd: global ? tmpdir() : process.cwd() })
    );

    execFileMock.mockImplementationOnce(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string) => void
    ) => {
      const project = { dependencies: { [name]: { version: '998.0.0' } } };
      cb(null, JSON.stringify(packageManager === 'pnpm' ? [project] : project));
      return {} as any;
    }) as any);
    second.emit('close', 0);
    await expect(result).resolves.toBe(0);
    expect(execFileMock).toHaveBeenCalledWith(
      packageManager,
      ['list', name, '--depth=0', '--json', ...(global ? ['--global'] : [])],
      expect.objectContaining({
        cwd: global ? tmpdir() : process.cwd(),
        timeout: 15000,
      }),
      expect.any(Function)
    );
    expect(writeConfigSpy).not.toHaveBeenCalled();
    expect(client.config.updates?.bypassMinReleaseAge).not.toBe(true);
    expect(outputMock.success).toHaveBeenCalledWith(
      'Upgraded Vercel CLI to v998.0.0.'
    );
    expect(outputMock.success).not.toHaveBeenCalledWith(
      'Upgraded Vercel CLI to v999.0.0.'
    );
  });

  it.each([
    'unchanged',
    'invalid',
    'error',
  ])('handles %s installed-version results without claiming the blocked version', async state => {
    const first = createMockProcess();
    const second = createMockProcess();
    spawnMock
      .mockReturnValueOnce(first as any)
      .mockReturnValueOnce(second as any);
    client.input.select = vi.fn().mockResolvedValue('allowed');
    const result = executeUpgrade('999.0.0', client);
    await tick();
    first.stderr.emit(
      'data',
      Buffer.from('ETARGET No matching version with a date before 2026-09-01')
    );
    first.emit('close', 1);
    await tick();
    execFileMock.mockImplementationOnce(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout?: string) => void
    ) => {
      cb(
        state === 'error' ? new Error('list failed') : null,
        state === 'invalid'
          ? 'not json'
          : JSON.stringify({
              dependencies: { vercel: { version: pkg.version } },
            })
      );
      return {} as any;
    }) as any);
    second.emit('close', 0);
    await expect(result).resolves.toBe(0);
    if (state === 'unchanged') {
      expect(outputMock.log).toHaveBeenCalledWith(
        `Vercel CLI remains at v${pkg.version} under your package manager settings.`
      );
      expect(outputMock.success).not.toHaveBeenCalled();
    } else {
      expect(outputMock.success).toHaveBeenCalledWith('Upgraded Vercel CLI.');
    }
    expect(outputMock.success).not.toHaveBeenCalledWith(
      'Upgraded Vercel CLI to v999.0.0.'
    );
    expect(writeConfigSpy).not.toHaveBeenCalled();
  });

  it.each([
    'cancel',
    'allowed',
  ])('handles %s without persisting bypass or repeatedly retrying', async action => {
    const first = createMockProcess();
    const second = createMockProcess();
    spawnMock
      .mockReturnValueOnce(first as any)
      .mockReturnValueOnce(second as any);
    client.input.select = vi.fn().mockResolvedValue(action);
    const result = executeUpgrade('999.0.0', client);
    await tick();
    first.stderr.emit(
      'data',
      Buffer.from('ETARGET No matching version with a date before 2026-09-01')
    );
    first.emit('close', 1);
    await tick();
    if (action === 'allowed') {
      second.stderr.emit(
        'data',
        Buffer.from('ETARGET No matching version with a date before 2026-09-01')
      );
      second.emit('close', 1);
    }
    await expect(result).resolves.toBe(action === 'cancel' ? 0 : 1);
    expect(spawnMock).toHaveBeenCalledTimes(action === 'cancel' ? 1 : 2);
    expect(client.input.select).toHaveBeenCalledTimes(1);
    expect(writeConfigSpy).not.toHaveBeenCalled();
    expect(outputMock.success).not.toHaveBeenCalled();
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    true,
    false,
  ])('does not prompt when nonInteractive=%s and stdin is not a TTY', async nonInteractive => {
    client.nonInteractive = nonInteractive;
    client.stdin.isTTY = false;
    const proc = createMockProcess();
    spawnMock.mockReturnValueOnce(proc as any);
    const result = executeUpgrade('999.0.0', client);
    await tick();
    proc.stderr.emit(
      'data',
      Buffer.from('ETARGET No matching version with a date before 2026-09-01')
    );
    proc.emit('close', 1);
    await expect(result).resolves.toBe(1);
    expect(client.input.select).not.toHaveBeenCalled();
    expect(writeConfigSpy).not.toHaveBeenCalled();
  });

  it.each([
    {
      manager: 'pnpm',
      raw: '',
      version: '11.0.0',
      expected:
        'pnpm 11.0.0 defaults to a minimum release age of 24 hours (1440 minutes); no explicit minimumReleaseAge setting was reported.',
    },
    {
      manager: 'pnpm',
      raw: '',
      version: '11.0.0-rc.0',
      expected: 'pnpm did not report a configured minimum release age.',
    },
    {
      manager: 'pnpm',
      raw: '1440',
      version: '11.0.0',
      expected: 'pnpm minimumReleaseAge is configured to 24 hours.',
    },
    {
      manager: 'pnpm',
      raw: '2880',
      version: '11.10.0',
      expected: 'pnpm minimumReleaseAge is configured to 48 hours.',
    },
    {
      manager: 'pnpm',
      raw: '"90"',
      version: '11.10.0',
      expected: 'pnpm minimumReleaseAge is configured to 90 minutes.',
    },
    {
      manager: 'pnpm',
      raw: '0',
      version: '11.10.0',
      expected: 'pnpm minimumReleaseAge is configured to 0 minutes.',
    },
    {
      manager: 'pnpm',
      raw: '',
      version: '11.10.0',
      expected:
        'pnpm 11.10.0 defaults to a minimum release age of 24 hours (1440 minutes); no explicit minimumReleaseAge setting was reported.',
    },
    {
      manager: 'pnpm',
      raw: 'undefined',
      version: '12.3.1',
      expected:
        'pnpm 12.3.1 defaults to a minimum release age of 24 hours (1440 minutes); no explicit minimumReleaseAge setting was reported.',
    },
    {
      manager: 'pnpm',
      raw: 'null',
      version: '10.29.3',
      expected: 'pnpm did not report a configured minimum release age.',
    },
    {
      manager: 'pnpm',
      raw: '',
      version: 'unknown',
      expected: 'pnpm did not report a configured minimum release age.',
    },
    {
      manager: 'pnpm',
      raw: '{bad json',
      version: '11.10.0',
      expected: "Could not determine pnpm's configured minimum release age.",
    },
    {
      manager: 'pnpm',
      raw: '-1',
      version: '11.10.0',
      expected: "Could not determine pnpm's configured minimum release age.",
    },
    {
      manager: 'pnpm',
      raw: 'error',
      version: '11.10.0',
      expected: "Could not determine pnpm's configured minimum release age.",
    },
    {
      manager: 'npm',
      raw: '2',
      version: '11.16.0',
      expected: 'npm min-release-age is configured to 48 hours.',
    },
  ])('explains $manager release age ($raw, $version) in both modes', async ({
    manager,
    raw,
    version,
    expected,
  }) => {
    for (const nonInteractive of [false, true]) {
      client.nonInteractive = nonInteractive;
      getUpdateCommandInfoMock.mockResolvedValueOnce({
        command: `${manager} i ${nonInteractive ? '-g ' : ''}vercel@latest`,
        packageManager: manager as 'npm' | 'pnpm',
        global: nonInteractive,
        assumed: false,
      });
      execFileMock.mockImplementation(((
        _cmd: string,
        args: string[],
        _opts: unknown,
        cb: (error: Error | null, stdout?: string) => void
      ) => {
        cb(
          raw === 'error' ? new Error('config failed') : null,
          args[0] === '--version' ? version : raw
        );
        return {} as any;
      }) as any);
      const proc = createMockProcess();
      spawnMock.mockReturnValueOnce(proc as any);
      const result = executeUpgrade('999.0.0', client);
      await tick();
      proc.stderr.emit(
        'data',
        Buffer.from(
          manager === 'pnpm'
            ? 'ERR_PNPM_NO_MATURE_MATCHING_VERSION No mature version found'
            : 'ETARGET No matching version with a date before 2026-09-01'
        )
      );
      proc.emit('close', 1);
      await expect(result).resolves.toBe(nonInteractive ? 1 : 0);
      expect(
        nonInteractive ? outputMock.error : outputMock.print
      ).toHaveBeenCalledWith(expect.stringContaining(expected));
      expect(execFileMock).toHaveBeenCalledWith(
        manager,
        [
          'config',
          'get',
          manager === 'pnpm' ? 'minimumReleaseAge' : 'min-release-age',
          '--json',
          ...(nonInteractive ? ['--global'] : []),
        ],
        expect.objectContaining({
          cwd: nonInteractive ? tmpdir() : process.cwd(),
          timeout: 15000,
        }),
        expect.any(Function)
      );
      expect(writeConfigSpy).not.toHaveBeenCalled();
      expect(outputMock.warn).not.toHaveBeenCalled();
      expect(outputMock.print).not.toHaveBeenCalledWith(
        expect.stringContaining('WARNING!')
      );
      if (!expected.includes('defaults to')) {
        expect(outputMock.print).not.toHaveBeenCalledWith(
          expect.stringContaining('defaults to')
        );
        expect(outputMock.error).not.toHaveBeenCalledWith(
          expect.stringContaining('defaults to')
        );
      }
    }
    expect(client.input.select).toHaveBeenCalledTimes(1);
  });

  it('fails non-interactively with both release-age options', async () => {
    getUpdateCommandInfoMock.mockResolvedValueOnce({
      command: 'pnpm i -g vercel@latest',
      global: true,
      packageManager: 'pnpm',
      assumed: false,
    });
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);
    client.nonInteractive = true;

    const exitCodePromise = executeUpgrade(undefined, client);
    await tick();
    mockProcess.stderr.emit(
      'data',
      Buffer.from(
        'ERR_PNPM_NO_MATCHING_VERSION No matching version found for vercel@999.0.0. Version 999.0.0 satisfies the specs but was released at Fri Sep 04 2026.'
      )
    );
    mockProcess.emit('close', 1);

    await expect(exitCodePromise).resolves.toBe(1);
    expect(outputMock.error).toHaveBeenCalledWith(
      'The package manager blocked this Vercel CLI release because of its minimum release-age setting. pnpm 11.10.0 defaults to a minimum release age of 24 hours (1440 minutes); no explicit minimumReleaseAge setting was reported.\nTo install the newest release allowed by your settings:\n  vc upgrade latest\nTo bypass the minimum release age for this and future foreground upgrades:\n  vc upgrade --bypass-min-release-age'
    );
    expect(client.input.confirm).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('does not misattribute an unrelated failure when release age is configured', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade(undefined, client);
    await tick();
    mockProcess.stderr.emit('data', Buffer.from('npm ERR! code EACCES'));
    mockProcess.emit('close', 1);

    await expect(exitCodePromise).resolves.toBe(1);
    expect(client.input.confirm).not.toHaveBeenCalled();
    expect(outputMock.error).toHaveBeenCalledWith(
      'Upgrade failed with exit code 1'
    );
    expect(outputMock.print).toHaveBeenCalledWith('npm ERR! code EACCES');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('persists an explicit bypass for future foreground upgrades', async () => {
    mockLatestVersion('999.0.0');
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade(undefined, client, true);
    await tick();
    mockProcess.emit('close', 0);

    await expect(exitCodePromise).resolves.toBe(0);
    expect(writeConfigSpy).toHaveBeenCalledWith({
      updates: { bypassMinReleaseAge: true },
    });
    expect(spawnMock).toHaveBeenCalledWith(
      'npm',
      ['i', '-g', 'vercel@999.0.0', '--min-release-age=0'],
      expect.any(Object)
    );
  });

  it('uses the persisted pnpm bypass without prompting', async () => {
    getUpdateCommandInfoMock.mockResolvedValueOnce({
      command: 'pnpm i -g vercel@latest',
      global: true,
      packageManager: 'pnpm',
      assumed: false,
    });
    mockLatestVersion('999.0.0');
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);
    client.config = { updates: { bypassMinReleaseAge: true } };

    const exitCodePromise = executeUpgrade(undefined, client);
    await tick();
    mockProcess.emit('close', 0);

    await expect(exitCodePromise).resolves.toBe(0);
    expect(spawnMock).toHaveBeenCalledWith(
      'pnpm',
      ['i', '-g', 'vercel@999.0.0', '--config.minimumReleaseAge=0'],
      expect.any(Object)
    );
    expect(client.input.confirm).not.toHaveBeenCalled();
  });
});

describe('executeHomebrewUpgrade', () => {
  const tick = () => new Promise(resolve => setImmediate(resolve));

  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.mockReset();
  });

  it('runs brew upgrade with inherited output', async () => {
    const mockProcess = new EventEmitter();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeHomebrewUpgrade();
    await tick();
    mockProcess.emit('close', 0);

    await expect(exitCodePromise).resolves.toBe(0);
    expect(spawnMock).toHaveBeenCalledWith(
      'brew',
      ['upgrade', 'vercel'],
      expect.objectContaining({
        cwd: tmpdir(),
        stdio: 'inherit',
        shell: false,
      })
    );
    expect(outputMock.error).not.toHaveBeenCalled();
  });

  it('passes through a failing brew exit code', async () => {
    const mockProcess = new EventEmitter();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeHomebrewUpgrade();
    await tick();
    mockProcess.emit('close', 3);

    await expect(exitCodePromise).resolves.toBe(3);
    expect(outputMock.error).toHaveBeenCalledWith(
      'Homebrew upgrade failed with exit code 3'
    );
    expect(outputMock.log).toHaveBeenCalledWith(
      'You can try running the command manually: brew upgrade vercel'
    );
  });

  it('reports when brew cannot be started', async () => {
    const mockProcess = new EventEmitter();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeHomebrewUpgrade();
    await tick();
    mockProcess.emit('error', new Error('spawn brew ENOENT'));

    await expect(exitCodePromise).resolves.toBe(1);
    expect(outputMock.error).toHaveBeenCalledWith(
      'Failed to run Homebrew: spawn brew ENOENT'
    );
  });
});
