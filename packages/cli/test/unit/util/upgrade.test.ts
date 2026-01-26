import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import output from '../../../src/output-manager';
import { executeUpgrade } from '../../../src/util/upgrade';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock output-manager
vi.mock('../../../src/output-manager', () => ({
  default: {
    log: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    print: vi.fn(),
  },
}));

// Mock get-update-command
vi.mock('../../../src/util/get-update-command', () => ({
  default: vi.fn().mockResolvedValue('npm i -g vercel@latest'),
}));

const spawnMock = vi.mocked(spawn);
const outputMock = vi.mocked(output);

describe('executeUpgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('should show success message and hide output on successful upgrade', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();

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
    // Output should NOT be printed on success
    expect(outputMock.print).not.toHaveBeenCalled();
  });

  it('should show captured output and error message on failed upgrade', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();

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
  });

  it('should handle spawn errors', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();

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
  });

  it('should handle null exit code as error', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();

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

    mockProcess.emit('close', 0);
    await exitCodePromise;

    expect(spawnMock).toHaveBeenCalledWith(
      'npm',
      ['i', '-g', 'vercel@latest'],
      {
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: false,
      }
    );
  });

  it('should log upgrade start message', async () => {
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess as any);

    const exitCodePromise = executeUpgrade();

    mockProcess.emit('close', 0);
    await exitCodePromise;

    expect(outputMock.log).toHaveBeenCalledWith('Upgrading Vercel CLI...');
    expect(outputMock.debug).toHaveBeenCalledWith(
      'Executing: npm i -g vercel@latest'
    );
  });
});
