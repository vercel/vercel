import { mkdtemp, remove } from 'fs-extra';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import execa from 'execa';
import { installBuilders } from '../../../../src/util/build/install-builders';

vi.mock('execa', () => ({
  default: vi.fn().mockResolvedValue({ stderr: '' }),
}));

const directories: string[] = [];

async function buildersDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'install-builders-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.mocked(execa).mockClear();
  await Promise.all(directories.splice(0).map(directory => remove(directory)));
});

describe('installBuilders()', () => {
  it('preserves npm settings for CLI-pinned Builders', async () => {
    const directory = await buildersDirectory();

    await installBuilders(
      directory,
      new Set(['@vercel/node@5.0.0']),
      undefined,
      undefined,
      new Map([['@vercel/node', '@vercel/node@5.0.0']])
    );

    expect(execa).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['install', '@vercel/node@5.0.0']),
      expect.objectContaining({ cwd: directory })
    );
    const [, args] = vi.mocked(execa).mock.calls[0];
    expect(args).not.toContain('--min-release-age=0');
  });

  it('falls back to npm-selected versions when a pinned install fails', async () => {
    const directory = await buildersDirectory();
    vi.mocked(execa).mockRejectedValueOnce(
      Object.assign(new Error('Command failed with exit code 1'), {
        stderr: 'npm error No matching version found',
      })
    );

    await installBuilders(
      directory,
      new Set(['@vercel/node@5.0.0']),
      undefined,
      undefined,
      new Map([['@vercel/node', '@vercel/node@5.0.0']])
    );

    expect(execa).toHaveBeenNthCalledWith(
      1,
      'npm',
      expect.arrayContaining(['install', '@vercel/node@5.0.0']),
      expect.objectContaining({ cwd: directory })
    );
    expect(execa).toHaveBeenNthCalledWith(
      2,
      'npm',
      expect.arrayContaining(['install', '@vercel/node']),
      expect.objectContaining({ cwd: directory })
    );
  });

  it('surfaces an error when both pinned and fallback installs fail', async () => {
    const directory = await buildersDirectory();
    vi.mocked(execa).mockRejectedValue(
      Object.assign(new Error('Command failed with exit code 1'), {
        stderr: 'npm error No matching version found',
      })
    );

    await expect(
      installBuilders(
        directory,
        new Set(['@vercel/node@5.0.0']),
        undefined,
        undefined,
        new Map([['@vercel/node', '@vercel/node@5.0.0']])
      )
    ).rejects.toThrow('npm error No matching version found');
    expect(execa).toHaveBeenCalledTimes(2);
  });

  it('does not fall back for unpinned Builders', async () => {
    const directory = await buildersDirectory();
    vi.mocked(execa).mockRejectedValueOnce(
      Object.assign(new Error('Command failed with exit code 1'), {
        stderr: 'npm error No matching version found',
      })
    );

    await expect(
      installBuilders(directory, new Set(['third-party-builder@1.0.0']))
    ).rejects.toThrow('npm error No matching version found');
    expect(execa).toHaveBeenCalledTimes(1);
  });
});
