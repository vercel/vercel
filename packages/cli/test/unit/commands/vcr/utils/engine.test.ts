import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import execa from 'execa';
import { runEngine } from '../../../../../src/commands/vcr/utils/engine';

vi.mock('execa', () => ({ default: vi.fn() }));

const mockedExeca = vi.mocked(execa);

describe('runEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('streams with inherited stdio and no captured stderr by default', async () => {
    mockedExeca.mockResolvedValue({ exitCode: 0 } as any);

    const result = await runEngine('docker', ['build', '.'], { cwd: '/tmp/x' });

    expect(result).toEqual({ exitCode: 0, stderr: '' });
    expect(mockedExeca).toHaveBeenCalledWith('docker', ['build', '.'], {
      cwd: '/tmp/x',
      stdio: 'inherit',
      reject: false,
    });
  });

  it('captures and live-pipes stderr when captureStderr is set', async () => {
    const pipe = vi.fn();
    mockedExeca.mockImplementation((() => {
      const subprocess: any = Promise.resolve({
        exitCode: 0,
        stderr: 'some progress',
      });
      subprocess.stderr = { pipe };
      return subprocess;
    }) as any);

    const result = await runEngine('docker', ['push', 'ref'], {
      cwd: '/tmp/x',
      captureStderr: true,
    });

    expect(result).toEqual({ exitCode: 0, stderr: 'some progress' });
    expect(mockedExeca).toHaveBeenCalledWith('docker', ['push', 'ref'], {
      cwd: '/tmp/x',
      stdio: ['inherit', 'inherit', 'pipe'],
      reject: false,
    });
    expect(pipe).toHaveBeenCalledWith(process.stderr);
  });

  it('surfaces the engine exit code on failure', async () => {
    mockedExeca.mockResolvedValue({ exitCode: 125 } as any);

    const result = await runEngine('docker', ['build', '.'], { cwd: '/tmp/x' });

    expect(result.exitCode).toBe(125);
  });

  it('treats a spawn failure (Error without exitCode) as exit 1', async () => {
    const spawnError = Object.assign(new Error('spawn docker ENOENT'), {
      exitCode: undefined,
    });
    mockedExeca.mockResolvedValue(spawnError as any);

    const result = await runEngine('docker', ['build', '.'], { cwd: '/tmp/x' });

    expect(result).toEqual({ exitCode: 1, stderr: 'spawn docker ENOENT' });
  });
});
