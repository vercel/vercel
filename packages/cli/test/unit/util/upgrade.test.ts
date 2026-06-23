import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { tmpdir } from 'os';
import { spawn, execFile } from 'child_process';
import output from '../../../src/output-manager';
import { executeUpgrade } from '../../../src/util/upgrade';
import { getUpdateCommandInfo } from '../../../src/util/get-update-command';
import pkg from '../../../src/util/pkg';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFile: vi.fn(),
}));

// Mock output-manager
vi.mock('../../../src/output-manager', () => ({
  default: {
    log: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    print: vi.fn(),
    spinner: vi.fn(),
    stopSpinner: vi.fn(),
  },
}));

// Mock get-update-command
vi.mock('../../../src/util/get-update-command', () => ({
  getUpdateCommandInfo: vi
    .fn()
    .mockResolvedValue({ command: 'npm i -g vercel@latest', global: true }),
}));

const spawnMock = vi.mocked(spawn);
const execFileMock = vi.mocked(execFile);
const outputMock = vi.mocked(output);
const getUpdateCommandInfoMock = vi.mocked(getUpdateCommandInfo);

// Makes the package manager's `latest` lookup resolve to `version`.
function mockLatestVersion(version: string) {
  execFileMock.mockImplementation(((
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout?: string, stderr?: string) => void
  ) => {
    const callback = typeof _opts === 'function' ? (_opts as typeof cb) : cb;
    callback(null, `${JSON.stringify(version)}\n`, '');
    return {} as any;
  }) as any);
}

describe('executeUpgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: the latest-version lookup fails, so the installer still runs
    // and the generic success message is used.
    execFileMock.mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null) => void
    ) => {
      const callback = typeof _opts === 'function' ? (_opts as typeof cb) : cb;
      callback(new Error('command not found'));
      return {} as any;
    }) as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
      'Vercel CLI has been upgraded successfully!'
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

  it('should include the target version in the success message when provided', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade('99.9.9');
    await tick();

    mockProcess.emit('close', 0);

    const exitCode = await exitCodePromise;

    expect(exitCode).toBe(0);
    expect(outputMock.success).toHaveBeenCalledWith(
      'Vercel CLI has been upgraded to v99.9.9 successfully!'
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
  });

  it('reports no upgrade available when the version did not change', async () => {
    mockLatestVersion(pkg.version);

    const exitCode = await executeUpgrade();

    expect(exitCode).toBe(0);
    expect(execFileMock).toHaveBeenCalledWith(
      'npm',
      ['view', 'vercel@latest', 'version', '--json'],
      expect.objectContaining({ encoding: 'utf8' }),
      expect.any(Function)
    );
    expect(spawnMock).not.toHaveBeenCalled();
    expect(outputMock.success).not.toHaveBeenCalled();
    expect(outputMock.log).toHaveBeenCalledWith(
      `No upgrade available. Vercel CLI is already up to date (v${pkg.version}).`
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
      'Vercel CLI has been upgraded to v999.0.0 successfully!'
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
      'You can try running the command manually: npm i -g vercel@latest'
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
      'You can try running the command manually: npm i -g vercel@latest'
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
      'Upgrade failed with exit code unknown'
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

  it('should spawn with correct arguments', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();
    await tick();

    mockProcess.emit('close', 0);
    await exitCodePromise;

    expect(spawnMock).toHaveBeenCalledWith(
      'npm',
      ['i', '-g', 'vercel@latest'],
      {
        cwd: tmpdir(),
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: false,
      }
    );
  });

  it('should spawn a global upgrade from a neutral directory', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();
    await tick();

    mockProcess.emit('close', 0);
    await exitCodePromise;

    expect(spawnMock).toHaveBeenCalledWith(
      'npm',
      ['i', '-g', 'vercel@latest'],
      expect.objectContaining({ cwd: tmpdir() })
    );
  });

  it('should spawn a local upgrade from the current working directory', async () => {
    getUpdateCommandInfoMock.mockResolvedValueOnce({
      command: 'pnpm i vercel@latest',
      global: false,
    });
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();
    await tick();

    mockProcess.emit('close', 0);
    await exitCodePromise;

    expect(spawnMock).toHaveBeenCalledWith(
      'pnpm',
      ['i', 'vercel@latest'],
      expect.objectContaining({ cwd: process.cwd() })
    );
  });

  it('shows bounded progress for a native binary upgrade', async () => {
    getUpdateCommandInfoMock.mockResolvedValueOnce({
      command: 'npm i -g @vercel/vc-native@latest --force',
      global: true,
    });
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();
    await tick();

    mockProcess.emit('close', 0);
    await exitCodePromise;

    expect(spawnMock).toHaveBeenCalledWith(
      'npm',
      ['i', '-g', '@vercel/vc-native@latest', '--force'],
      {
        cwd: tmpdir(),
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

  it('reports no upgrade for an up-to-date native binary', async () => {
    getUpdateCommandInfoMock.mockResolvedValueOnce({
      command: 'npm i -g @vercel/vc-native@latest --force',
      global: true,
    });
    mockLatestVersion(pkg.version);

    const exitCode = await executeUpgrade();

    expect(exitCode).toBe(0);
    expect(execFileMock).toHaveBeenCalledWith(
      'npm',
      ['view', '@vercel/vc-native@latest', 'version', '--json'],
      expect.objectContaining({ encoding: 'utf8' }),
      expect.any(Function)
    );
    expect(spawnMock).not.toHaveBeenCalled();
    expect(outputMock.success).not.toHaveBeenCalled();
    expect(outputMock.log).toHaveBeenCalledWith(
      `No upgrade available. Vercel CLI is already up to date (v${pkg.version}).`
    );
  });

  it('should log the upgrade command in debug mode', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();
    await tick();

    mockProcess.emit('close', 0);
    await exitCodePromise;

    expect(outputMock.debug).toHaveBeenCalledWith(
      `Executing: npm i -g vercel@latest (cwd: ${tmpdir()})`
    );
  });
});
