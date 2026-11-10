import { afterEach, describe, expect, it, vi } from 'vitest';
import spawn from 'cross-spawn';
import { execCommand, spawnCommand } from '../src/fs/run-user-scripts';

vi.mock('cross-spawn', async importOriginal => {
  const original = await importOriginal<typeof import('cross-spawn')>();
  return { default: vi.fn(original.default) };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('shell commands in the native CLI', () => {
  it.each([
    '1',
    undefined,
  ])('runs Node commands with native=%s', async native => {
    vi.stubEnv('VERCEL_VC_NATIVE', native);
    const command = 'node -p 42';
    const child = spawnCommand(command, {
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    let stdout = '';
    child.stdout!.on('data', data => (stdout += data));
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    expect(code).toBe(0);
    expect(stdout.trim()).toBe('42');
    expect(spawn).toHaveBeenCalledWith(
      process.platform === 'win32' ? 'cmd.exe' : 'sh',
      [
        process.platform === 'win32' ? '/C' : '-c',
        native ? ` ${command}` : command,
      ],
      expect.objectContaining({ prettyCommand: command })
    );
  });

  it('preserves compound shell commands through execCommand', async () => {
    vi.stubEnv('VERCEL_VC_NATIVE', '1');
    const command = 'node -p 1 && node -p 2';
    await expect(execCommand(command, { stdio: 'pipe' })).resolves.toBe(true);
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([` ${command}`]),
      expect.objectContaining({ prettyCommand: command })
    );
  });

  it('preserves nonzero exit status', async () => {
    vi.stubEnv('VERCEL_VC_NATIVE', '1');
    await expect(execCommand('node -e process.exitCode=7')).rejects.toThrow(
      'exited with 7'
    );
  });
});
