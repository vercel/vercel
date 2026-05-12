import { describe, beforeEach, expect, it, vi } from 'vitest';
import { inputRootDirectory } from '../../../../src/util/input/input-root-directory';
import { client } from '../../../mocks/client';

vi.mock('@vercel/fs-detectors', async () => {
  const actual = await vi.importActual<typeof import('@vercel/fs-detectors')>(
    '@vercel/fs-detectors'
  );
  return {
    ...actual,
    getWorkspaces: vi.fn(),
  };
});

const { getWorkspaces } = await import('@vercel/fs-detectors');
const mockedGetWorkspaces = vi.mocked(getWorkspaces);

describe('inputRootDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not throw when getWorkspaces throws (ENOENT/EACCES) — falls back to null', async () => {
    mockedGetWorkspaces.mockRejectedValueOnce(
      Object.assign(new Error('ENOENT: no such file or directory'), {
        code: 'ENOENT',
      })
    );

    await expect(
      inputRootDirectory(client, '/nonexistent', false)
    ).resolves.toBeNull();
  });

  it('returns null without prompting when getWorkspaces returns []', async () => {
    mockedGetWorkspaces.mockResolvedValueOnce([]);

    const result = await inputRootDirectory(client, '/tmp', false);

    expect(result).toBeNull();
    expect(client.stderr.getFullOutput()).not.toContain(
      'In which directory is your code located?'
    );
  });

  it('prompts when getWorkspaces returns a non-empty array', async () => {
    mockedGetWorkspaces.mockResolvedValueOnce([
      { rootPath: '/tmp/pkg-a', type: 'npm' },
    ] as unknown as Awaited<ReturnType<typeof getWorkspaces>>);

    const resultPromise = inputRootDirectory(client, '/tmp', false);

    await expect(client.stderr).toOutput(
      'In which directory is your code located?'
    );
    // Submit empty input to resolve the prompt (returns null path).
    client.stdin.write('\n');

    await resultPromise;
  });
});
