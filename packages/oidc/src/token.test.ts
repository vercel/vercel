import { describe, beforeEach, afterEach, test, vi, expect } from 'vitest';
import * as childProcess from 'child_process';
import { refreshToken } from './token';

vi.mock('child_process');

describe('refreshToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VERCEL_OIDC_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockExecFile(stdout: string, error?: Error) {
    vi.mocked(childProcess.execFile).mockImplementation(((
      _cmd: string,
      _args: any,
      callback: any
    ) => {
      if (error) {
        callback(error, '', error.message);
      } else {
        callback(null, stdout, '');
      }
    }) as any);
  }

  test('should call vercel CLI and set VERCEL_OIDC_TOKEN', async () => {
    mockExecFile('test-token\n');

    await refreshToken();

    expect(childProcess.execFile).toHaveBeenCalledWith(
      'vercel',
      ['project', 'token', '--yes'],
      expect.any(Function)
    );
    expect(process.env.VERCEL_OIDC_TOKEN).toBe('test-token');
  });

  test('should pass project name when provided', async () => {
    mockExecFile('project-token\n');

    await refreshToken({ project: 'my-project' });

    expect(childProcess.execFile).toHaveBeenCalledWith(
      'vercel',
      ['project', 'token', 'my-project', '--yes'],
      expect.any(Function)
    );
    expect(process.env.VERCEL_OIDC_TOKEN).toBe('project-token');
  });

  test('should pass --scope when team is provided', async () => {
    mockExecFile('team-token\n');

    await refreshToken({ team: 'my-team' });

    expect(childProcess.execFile).toHaveBeenCalledWith(
      'vercel',
      ['project', 'token', '--scope', 'my-team', '--yes'],
      expect.any(Function)
    );
    expect(process.env.VERCEL_OIDC_TOKEN).toBe('team-token');
  });

  test('should pass both project and --scope when both are provided', async () => {
    mockExecFile('both-token\n');

    await refreshToken({ project: 'my-project', team: 'my-team' });

    expect(childProcess.execFile).toHaveBeenCalledWith(
      'vercel',
      ['project', 'token', 'my-project', '--scope', 'my-team', '--yes'],
      expect.any(Function)
    );
    expect(process.env.VERCEL_OIDC_TOKEN).toBe('both-token');
  });

  test('should throw helpful error when CLI is not installed', async () => {
    const error = new Error('spawn vercel ENOENT') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    mockExecFile('', error);

    await expect(refreshToken()).rejects.toThrow(
      'Vercel CLI not found. Install it with `npm i -g vercel` and log in with `vercel login`.'
    );
  });

  test('should throw error with stderr when CLI fails', async () => {
    const error = new Error('Command failed');
    vi.mocked(childProcess.execFile).mockImplementation(((
      _cmd: string,
      _args: any,
      callback: any
    ) => {
      callback(error, '', 'Error: No such project exists');
    }) as any);

    await expect(refreshToken()).rejects.toThrow(
      'Failed to refresh OIDC token: Error: No such project exists'
    );
  });

  test('should trim whitespace from token output', async () => {
    mockExecFile('  token-with-spaces  \n');

    await refreshToken();

    expect(process.env.VERCEL_OIDC_TOKEN).toBe('token-with-spaces');
  });
});
