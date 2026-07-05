import { spawn, spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { createArchiveFiles } from '../src/utils/archive';

vi.mock('node:child_process', async importActual => {
  const actual = await importActual<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
    spawnSync: vi.fn(),
  };
});

describe('createArchiveFiles()', () => {
  it('fails before spawning zstd when the binary is missing', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      error: Object.assign(new Error('spawn zstd ENOENT'), {
        code: 'ENOENT',
      }),
      status: null,
      signal: null,
      output: [],
      pid: 0,
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
    });

    await expect(
      createArchiveFiles('/tmp/project', [], 'zstd')
    ).rejects.toThrow(
      /The `zstd` binary is not installed or not found on PATH\..*Use --archive=tgz for a portable fallback\./
    );
    expect(spawn).not.toHaveBeenCalled();
  });
});
