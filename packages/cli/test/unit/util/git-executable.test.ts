import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: vi.fn(),
  which: vi.fn(),
  access: vi.fn(),
  run: vi.fn(),
}));
vi.mock('node:os', () => ({ platform: mocks.platform }));
vi.mock(
  'node:path',
  async () =>
    (await vi.importActual<typeof import('node:path')>('node:path')).posix
);
vi.mock('which', () => ({ default: { sync: mocks.which } }));
vi.mock('node:fs', () => ({
  accessSync: mocks.access,
  constants: { X_OK: 1 },
}));
vi.mock('node:child_process', () => {
  return {
    // Match pkg's wrapper: a callback API with no promisify.custom property.
    execFile: (
      file: string,
      args: string[],
      options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      mocks.run(file, args, options).then(
        (result: { stdout: string; stderr?: string }) =>
          callback(null, result.stdout, result.stderr ?? ''),
        (error: Error) => callback(error, '', '')
      );
    },
  };
});

describe('Git executable discovery', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubEnv('PATH', '/usr/bin:/bin');
    mocks.platform.mockReturnValue('darwin');
    mocks.which.mockReturnValue('/usr/bin/git');
    mocks.run.mockResolvedValue({
      stdout: '/selected/developer/usr/bin/git\n',
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('resolves the selected developer Git once for concurrent callers', async () => {
    const { getGitExecutable } = await import(
      '../../../src/util/git-executable'
    );
    expect(
      await Promise.all([
        getGitExecutable('/project'),
        getGitExecutable('/project'),
      ])
    ).toEqual([
      '/selected/developer/usr/bin/git',
      '/selected/developer/usr/bin/git',
    ]);
    expect(mocks.run).toHaveBeenCalledExactlyOnceWith(
      '/usr/bin/xcrun',
      ['--find', 'git'],
      { cwd: '/project', encoding: 'utf8' }
    );
    expect(mocks.access).toHaveBeenCalledWith(
      '/selected/developer/usr/bin/git',
      1
    );
  });

  it('preserves custom Git and platforms without the Apple launcher', async () => {
    const { getGitExecutable } = await import(
      '../../../src/util/git-executable'
    );
    mocks.which.mockReturnValue('/custom/bin/git');
    expect(await getGitExecutable('/project')).toBe('git');
    mocks.platform.mockReturnValue('linux');
    expect(await getGitExecutable('/other')).toBe('git');
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it.each([
    'failure',
    'relative',
    'launcher',
    'inaccessible',
  ])('falls back when discovery is %s', async failure => {
    const { getGitExecutable } = await import(
      '../../../src/util/git-executable'
    );
    if (failure === 'failure')
      mocks.run.mockRejectedValue(new Error('no developer tools'));
    if (failure === 'relative')
      mocks.run.mockResolvedValue({ stdout: 'relative/git' });
    if (failure === 'launcher')
      mocks.run.mockResolvedValue({ stdout: '/usr/bin/git' });
    if (failure === 'inaccessible')
      mocks.access.mockImplementation(() => {
        throw new Error('denied');
      });
    expect(await getGitExecutable('/project')).toBe('git');
  });

  it('respects changes to developer selection and resolves relative PATH from cwd', async () => {
    const { getGitExecutable } = await import(
      '../../../src/util/git-executable'
    );
    await getGitExecutable('/project');
    vi.stubEnv('DEVELOPER_DIR', '/other/Xcode');
    await getGitExecutable('/project');
    expect(mocks.run).toHaveBeenCalledTimes(2);
    vi.stubEnv('PATH', 'bin:/usr/bin');
    mocks.which.mockReturnValue('/other/bin/git');
    expect(await getGitExecutable('/other')).toBe('git');
    expect(mocks.which).toHaveBeenLastCalledWith('git', {
      path: '/other/bin:/usr/bin',
      nothrow: true,
    });
  });
});
