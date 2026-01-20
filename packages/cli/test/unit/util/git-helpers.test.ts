import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getGitDirectory,
  getGitRootDirectory,
  getGitRemoteUrls,
  getGitOriginUrl,
} from '../../../src/util/git-helpers';
import { setupTmpDir } from '../../helpers/setup-unit-fixture';
import {
  initGitRepo,
  setupBareRepoWithWorktree,
} from '../../helpers/git-test-helpers';

// Root of `vercel/vercel` repo
const vercelRepoRoot = join(__dirname, '../../../../..');

describe('git-helpers', () => {
  describe('getGitDirectory()', () => {
    it('should return .git for a normal repo', async () => {
      const result = await getGitDirectory({ cwd: vercelRepoRoot });
      expect(result).toEqual('.git');
    });

    it('should return null for non-git directory', async () => {
      const cwd = setupTmpDir();
      const result = await getGitDirectory({ cwd });
      expect(result).toEqual(null);
    });
  });

  describe('getGitRootDirectory()', () => {
    it('should return repo root from root', async () => {
      const result = await getGitRootDirectory({ cwd: vercelRepoRoot });
      expect(result).toEqual(vercelRepoRoot);
    });

    it('should return repo root from subdirectory', async () => {
      const result = await getGitRootDirectory({ cwd: __dirname });
      expect(result).toEqual(vercelRepoRoot);
    });

    it('should return null for non-git directory', async () => {
      const cwd = setupTmpDir();
      const result = await getGitRootDirectory({ cwd });
      expect(result).toEqual(null);
    });
  });

  describe('getGitRemoteUrls()', () => {
    it('should return remote URLs for a repo with remotes', async () => {
      const result = await getGitRemoteUrls({ cwd: vercelRepoRoot });
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('origin');
    });

    it('should return null for non-git directory', async () => {
      const cwd = setupTmpDir();
      const result = await getGitRemoteUrls({ cwd });
      expect(result).toEqual(null);
    });

    it('should return empty object for git repo with no remotes', async () => {
      const cwd = setupTmpDir();
      initGitRepo(cwd, {}); // No remotes
      const result = await getGitRemoteUrls({ cwd });
      expect(result).toEqual({});
    });
  });

  describe('getGitOriginUrl()', () => {
    it('should return origin URL for a repo with origin remote', async () => {
      const result = await getGitOriginUrl({ cwd: vercelRepoRoot });
      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
    });

    it('should return null for non-git directory', async () => {
      const cwd = setupTmpDir();
      const result = await getGitOriginUrl({ cwd });
      expect(result).toEqual(null);
    });

    it('should return null for repo with remotes but no origin', async () => {
      const cwd = setupTmpDir();
      initGitRepo(cwd, { upstream: 'https://github.com/example/upstream.git' });
      const result = await getGitOriginUrl({ cwd });
      expect(result).toEqual(null);
    });
  });

  describe('bare repository worktree', () => {
    let worktreePath: string;

    beforeAll(() => {
      const testDir = setupTmpDir('bare-worktree-test');
      ({ worktreePath } = setupBareRepoWithWorktree(
        testDir,
        'https://github.com/example/test-repo.git'
      ));
    });

    it('should have .git as a file (not directory) in worktree', () => {
      const gitPath = join(worktreePath, '.git');
      const content = readFileSync(gitPath, 'utf8');
      expect(content).toContain('gitdir:');
    });

    it('getGitDirectory() should return path containing worktrees/', async () => {
      const result = await getGitDirectory({ cwd: worktreePath });
      expect(result).not.toBeNull();
      // For bare repo worktrees, the path is like /path/to/repo.git/worktrees/worktree
      // NOT like /path/to/.git/worktrees/worktree
      expect(result).toContain('worktrees/');
    });

    it('getGitRootDirectory() should return the worktree path', async () => {
      const result = await getGitRootDirectory({ cwd: worktreePath });
      expect(result).toEqual(worktreePath);
    });

    it('getGitRemoteUrls() should return remotes from the bare repo', async () => {
      const result = await getGitRemoteUrls({ cwd: worktreePath });
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('origin');
      expect(result?.origin).toEqual(
        'https://github.com/example/test-repo.git'
      );
    });

    it('getGitOriginUrl() should return origin URL from the bare repo', async () => {
      const result = await getGitOriginUrl({ cwd: worktreePath });
      expect(result).toEqual('https://github.com/example/test-repo.git');
    });
  });
});
