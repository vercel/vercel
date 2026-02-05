import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getGitConfigPath,
  getGitRootDirectory,
  isGitWorktreeOrSubmodule,
} from '../../../src/util/git-helpers';

describe('git-helpers', () => {
  describe('in a regular git repository', () => {
    let repoDir: string;

    beforeAll(() => {
      // Create a temporary git repository
      // Use realpathSync to resolve symlinks (e.g., /var -> /private/var on macOS)
      repoDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-helpers-test-')));
      execSync('git init', { cwd: repoDir, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', {
        cwd: repoDir,
        stdio: 'ignore',
      });
      execSync('git config user.name "Test"', {
        cwd: repoDir,
        stdio: 'ignore',
      });
      writeFileSync(join(repoDir, 'file.txt'), 'test');
      execSync('git add .', { cwd: repoDir, stdio: 'ignore' });
      execSync('git commit -m "initial"', { cwd: repoDir, stdio: 'ignore' });
      execSync('git remote add origin https://github.com/test/test.git', {
        cwd: repoDir,
        stdio: 'ignore',
      });
    });

    afterAll(() => {
      rmSync(repoDir, { recursive: true, force: true });
    });

    it('getGitRootDirectory should return the repo root', () => {
      const root = getGitRootDirectory({ cwd: repoDir });
      expect(root).toEqual(repoDir);
    });

    it('getGitRootDirectory should return the repo root from a subdirectory', () => {
      const subDir = join(repoDir, 'subdir');
      execSync(`mkdir -p "${subDir}"`);
      const root = getGitRootDirectory({ cwd: subDir });
      expect(root).toEqual(repoDir);
    });

    it('getGitConfigPath should return path to .git/config', () => {
      const configPath = getGitConfigPath({ cwd: repoDir });
      expect(configPath).toEqual(join(repoDir, '.git', 'config'));
    });

    it('getGitConfigPath should return a valid config file with remotes', () => {
      const configPath = getGitConfigPath({ cwd: repoDir });
      expect(configPath).not.toBeNull();
      const content = readFileSync(configPath!, 'utf-8');
      expect(content).toContain('[remote "origin"]');
      expect(content).toContain('https://github.com/test/test.git');
    });

    it('isGitWorktreeOrSubmodule should return false', () => {
      const result = isGitWorktreeOrSubmodule({ cwd: repoDir });
      expect(result).toBe(false);
    });
  });

  describe('in a git worktree', () => {
    let mainRepoDir: string;
    let worktreeDir: string;

    beforeAll(() => {
      // Create a temporary git repository with a worktree
      // Use realpathSync to resolve symlinks (e.g., /var -> /private/var on macOS)
      mainRepoDir = realpathSync(
        mkdtempSync(join(tmpdir(), 'git-helpers-main-'))
      );
      worktreeDir = realpathSync(
        mkdtempSync(join(tmpdir(), 'git-helpers-worktree-'))
      );

      // Remove the worktree dir so git can create it
      rmSync(worktreeDir, { recursive: true, force: true });

      // Initialize main repo
      execSync('git init', { cwd: mainRepoDir, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', {
        cwd: mainRepoDir,
        stdio: 'ignore',
      });
      execSync('git config user.name "Test"', {
        cwd: mainRepoDir,
        stdio: 'ignore',
      });
      writeFileSync(join(mainRepoDir, 'file.txt'), 'test');
      execSync('git add .', { cwd: mainRepoDir, stdio: 'ignore' });
      execSync('git commit -m "initial"', {
        cwd: mainRepoDir,
        stdio: 'ignore',
      });
      execSync('git remote add origin https://github.com/test/worktree.git', {
        cwd: mainRepoDir,
        stdio: 'ignore',
      });

      // Create a branch and worktree
      execSync('git branch feature', { cwd: mainRepoDir, stdio: 'ignore' });
      execSync(`git worktree add "${worktreeDir}" feature`, {
        cwd: mainRepoDir,
        stdio: 'ignore',
      });
    });

    afterAll(() => {
      // Remove worktree first, then the main repo
      try {
        execSync(`git worktree remove "${worktreeDir}" --force`, {
          cwd: mainRepoDir,
          stdio: 'ignore',
        });
      } catch {
        // Ignore errors during cleanup
      }
      rmSync(mainRepoDir, { recursive: true, force: true });
      rmSync(worktreeDir, { recursive: true, force: true });
    });

    it('getGitRootDirectory should return the worktree directory (not main repo)', () => {
      const root = getGitRootDirectory({ cwd: worktreeDir });
      expect(root).toEqual(worktreeDir);
    });

    it('getGitConfigPath should return the shared config in main repo', () => {
      const configPath = getGitConfigPath({ cwd: worktreeDir });
      // Config should be in the main repo's .git directory
      expect(configPath).toEqual(join(mainRepoDir, '.git', 'config'));
    });

    it('getGitConfigPath should return a valid config file with remotes', () => {
      const configPath = getGitConfigPath({ cwd: worktreeDir });
      expect(configPath).not.toBeNull();
      const content = readFileSync(configPath!, 'utf-8');
      expect(content).toContain('[remote "origin"]');
      expect(content).toContain('https://github.com/test/worktree.git');
    });

    it('isGitWorktreeOrSubmodule should return true', () => {
      const result = isGitWorktreeOrSubmodule({ cwd: worktreeDir });
      expect(result).toBe(true);
    });

    it('.git in worktree should be a file, not a directory', () => {
      const gitPath = join(worktreeDir, '.git');
      const content = readFileSync(gitPath, 'utf-8');
      expect(content).toContain('gitdir:');
    });
  });

  describe('outside a git repository', () => {
    let nonRepoDir: string;

    beforeAll(() => {
      nonRepoDir = realpathSync(
        mkdtempSync(join(tmpdir(), 'git-helpers-non-repo-'))
      );
    });

    afterAll(() => {
      rmSync(nonRepoDir, { recursive: true, force: true });
    });

    it('getGitRootDirectory should return null', () => {
      const root = getGitRootDirectory({ cwd: nonRepoDir });
      expect(root).toBeNull();
    });

    it('getGitConfigPath should return null', () => {
      const configPath = getGitConfigPath({ cwd: nonRepoDir });
      expect(configPath).toBeNull();
    });

    it('isGitWorktreeOrSubmodule should return false', () => {
      const result = isGitWorktreeOrSubmodule({ cwd: nonRepoDir });
      expect(result).toBe(false);
    });
  });
});
