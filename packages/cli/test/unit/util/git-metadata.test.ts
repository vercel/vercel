import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as gitExecutable from '../../../src/util/git-executable';
import * as execFile from '../../../src/util/exec-file';
import { createGitMeta } from '../../../src/util/create-git-meta';
import { getGitRootDirectoryAsync } from '../../../src/util/git-helpers';

describe('Git metadata preparation', () => {
  let directory: string;
  beforeEach(() => {
    directory = realpathSync.native(
      mkdtempSync(join(tmpdir(), 'metadata test '))
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  function git(cwd: string, ...args: string[]) {
    return execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  it('preserves metadata in nested paths, detached HEADs, and worktrees', async () => {
    const repository = join(directory, 'repo');
    mkdirSync(repository);
    git(repository, 'init', '-b', 'metadata-test');
    git(
      repository,
      '-c',
      'user.name=Test Author',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'subject with <##> and ü'
    );
    const hash = git(repository, 'rev-parse', 'HEAD');
    // Exercise CRLF output on every platform, not just Windows CI.
    const originalExecFile = execFile.execFileAsync;
    vi.spyOn(execFile, 'execFileAsync').mockImplementation(async (...args) => {
      const result = await originalExecFile(...args);
      return args[1][0] === 'rev-parse'
        ? { ...result, stdout: result.stdout.replace(/\r?\n/g, '\r\n') }
        : result;
    });
    const nested = join(repository, 'nested');
    mkdirSync(nested);
    expect(await createGitMeta(nested)).toEqual({
      commitAuthorName: 'Test Author',
      commitAuthorEmail: 'test@example.com',
      commitMessage: 'subject with <##> and ü',
      commitRef: 'metadata-test',
      commitSha: hash,
      dirty: false,
      remoteUrl: undefined,
      rootDirectory: 'nested',
    });
    expect(normalize((await getGitRootDirectoryAsync({ cwd: nested }))!)).toBe(
      repository
    );

    const untracked = join(nested, 'untracked.txt');
    writeFileSync(untracked, 'local changes');
    expect(await createGitMeta(nested)).toMatchObject({ dirty: true });
    rmSync(untracked);

    git(repository, 'checkout', '--detach', 'HEAD');
    expect(await createGitMeta(repository)).toMatchObject({
      commitRef: 'HEAD',
      commitSha: hash,
      rootDirectory: '',
    });
    const worktree = join(directory, 'linked');
    git(repository, 'worktree', 'add', '-b', 'linked-branch', worktree);
    expect(
      normalize((await getGitRootDirectoryAsync({ cwd: worktree }))!)
    ).toBe(worktree);
    expect(await createGitMeta(worktree)).toMatchObject({
      commitRef: 'linked-branch',
      commitSha: hash,
      rootDirectory: '',
    });
  });

  it('returns no metadata outside a repository and preserves unsafe errors', async () => {
    expect(await createGitMeta(directory)).toBeUndefined();
    expect(await getGitRootDirectoryAsync({ cwd: directory })).toBeNull();
    await expect(
      getGitRootDirectoryAsync({ cwd: directory, unsafe: true })
    ).rejects.toThrow();
  });

  it('waits for concurrent queries after repository discovery fails', async () => {
    vi.spyOn(gitExecutable, 'getGitExecutable').mockResolvedValue('git');
    let finishCommit!: () => void;
    let failDiscovery!: () => void;
    const commit = new Promise<{ stdout: string; stderr: string }>(resolve => {
      finishCommit = () => resolve({ stdout: '', stderr: '' });
    });
    const discovery = new Promise<{ stdout: string; stderr: string }>(
      (_, reject) => {
        failDiscovery = () => reject(new Error('not a repository'));
      }
    );
    vi.spyOn(execFile, 'execFileAsync').mockImplementation((_, args) =>
      args[0] === 'log' ? commit : discovery
    );
    let settled = false;
    const metadata = createGitMeta(directory).then(value => {
      settled = true;
      return value;
    });
    await vi.waitFor(() =>
      expect(execFile.execFileAsync).toHaveBeenCalledTimes(2)
    );
    failDiscovery();
    await new Promise(resolve => setImmediate(resolve));
    const settledBeforeCommit = settled;
    finishCommit();
    await expect(metadata).resolves.toBeUndefined();
    expect(settledBeforeCommit).toBe(false);
  });

  it('returns no metadata for an unborn branch', async () => {
    git(directory, 'init');
    expect(await createGitMeta(directory)).toBeUndefined();
  });
});
