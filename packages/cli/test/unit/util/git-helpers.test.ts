import { describe, expect, it, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  getGitDirectory,
  getGitRootDirectory,
  getGitRemoteUrls,
  getGitOriginUrl,
} from '../../../src/util/git-helpers';
import { setupTmpDir } from '../../helpers/setup-unit-fixture';
import { initBareGitRepo, initGitRepo } from '../../helpers/git-test-helpers';

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
  });

  describe('bare repository worktree', () => {
    let testDir: string;
    let bareRepoPath: string;
    let worktreePath: string;

    beforeAll(() => {
      // setupTmpDir uses realpathSync internally, which resolves symlinks.
      // This is important because Git commands return resolved paths
      // (e.g., on macOS /var is a symlink to /private/var).
      testDir = setupTmpDir('bare-worktree-test');
      bareRepoPath = join(testDir, 'repo.git');
      worktreePath = join(testDir, 'worktree');

      // Initialize a bare repository with remote
      execSync('mkdir repo.git', { cwd: testDir });
      initBareGitRepo(bareRepoPath, {
        origin: 'https://github.com/example/test-repo.git',
      });

      // Create an initial commit in the bare repo (required to create a worktree).
      // We do this by creating a temporary clone, committing, and pushing.
      const tempClone = join(testDir, 'temp-clone');
      execSync(`git clone ${bareRepoPath} temp-clone`, { cwd: testDir });
      execSync('git config user.email "test@test.com"', { cwd: tempClone });
      execSync('git config user.name "Test"', { cwd: tempClone });
      execSync('touch README.md', { cwd: tempClone });
      execSync('git add .', { cwd: tempClone });
      execSync('git commit -m "initial commit"', { cwd: tempClone });
      execSync('git push origin HEAD:main', { cwd: tempClone });
      rmSync(tempClone, { recursive: true });

      // Create a worktree from the bare repo
      execSync(`git worktree add ${worktreePath} main`, { cwd: bareRepoPath });
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
