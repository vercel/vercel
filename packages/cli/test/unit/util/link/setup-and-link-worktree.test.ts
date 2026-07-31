import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { realpathSync } from 'node:fs';
import { resolveGitConnectIntent } from '../../../../src/util/link/setup-and-link';
import { client } from '../../../mocks/client';

/** Resolves symlinks (macOS `/var` -> `/private/var`) so paths compare equal. */
function resolveLongPath(p: string): string {
  return realpathSync(normalize(p));
}

function initRepo(dir: string, remoteUrl: string) {
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', {
    cwd: dir,
    stdio: 'ignore',
  });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(dir, 'file.txt'), 'test');
  execSync('git add .', { cwd: dir, stdio: 'ignore' });
  execSync('git commit -m "initial"', { cwd: dir, stdio: 'ignore' });
  execSync(`git remote add origin ${remoteUrl}`, { cwd: dir, stdio: 'ignore' });
}

// These build real repositories rather than mocking `parseGitConfig`, because
// the bug being guarded against is that `.git` is a *file* in worktrees and
// submodules, which a mock would hide.
describe('resolveGitConnectIntent() with a linked `.git` file', () => {
  describe('in a git worktree', () => {
    let mainRepoDir: string;
    let worktreeDir: string;

    beforeAll(() => {
      mainRepoDir = resolveLongPath(mkdtempSync(join(tmpdir(), 'sal-main-')));
      worktreeDir = resolveLongPath(mkdtempSync(join(tmpdir(), 'sal-wt-')));
      rmSync(worktreeDir, { recursive: true, force: true });

      initRepo(mainRepoDir, 'https://github.com/test/worktree-repo.git');
      execSync('git branch feature', { cwd: mainRepoDir, stdio: 'ignore' });
      execSync(`git worktree add "${worktreeDir}" feature`, {
        cwd: mainRepoDir,
        stdio: 'ignore',
      });
    });

    afterAll(() => {
      try {
        execSync(`git worktree remove "${worktreeDir}" --force`, {
          cwd: mainRepoDir,
          stdio: 'ignore',
        });
      } catch {
        // Ignore cleanup errors
      }
      rmSync(mainRepoDir, { recursive: true, force: true });
      rmSync(worktreeDir, { recursive: true, force: true });
    });

    it('should find the remote even though `.git` is a file', async () => {
      const intent = await resolveGitConnectIntent(client, worktreeDir, true);

      // Previously null: `<worktree>/.git/config` does not exist, so the
      // connect prompt was skipped without explanation.
      expect(intent).not.toBeNull();
      expect(intent?.repoInfo.repo).toEqual('worktree-repo');
      expect(intent?.remoteName).toEqual('origin');
      expect(intent?.rootDirectory).toBeNull();
    });

    it('should derive the root directory from a worktree subdirectory', async () => {
      const appDir = join(worktreeDir, 'apps', 'web');
      mkdirSync(appDir, { recursive: true });

      const intent = await resolveGitConnectIntent(client, appDir, true);

      expect(intent?.rootDirectory).toEqual('apps/web');
    });
  });

  describe('in a git submodule', () => {
    let parentDir: string;
    let childDir: string;
    let submodulePath: string;

    beforeAll(() => {
      parentDir = resolveLongPath(mkdtempSync(join(tmpdir(), 'sal-parent-')));
      childDir = resolveLongPath(mkdtempSync(join(tmpdir(), 'sal-child-')));

      initRepo(childDir, 'https://github.com/test/child-repo.git');
      initRepo(parentDir, 'https://github.com/test/parent-repo.git');

      execSync(
        `git -c protocol.file.allow=always submodule add "${childDir}" sub`,
        { cwd: parentDir, stdio: 'ignore' }
      );
      execSync('git commit -m "add submodule"', {
        cwd: parentDir,
        stdio: 'ignore',
      });
      submodulePath = join(parentDir, 'sub');

      // `submodule add` records the local clone source as the remote. Point it
      // at a real provider URL so it parses the way a checked-out submodule
      // would.
      execSync(
        'git remote set-url origin https://github.com/test/child-repo.git',
        { cwd: submodulePath, stdio: 'ignore' }
      );
    });

    afterAll(() => {
      rmSync(parentDir, { recursive: true, force: true });
      rmSync(childDir, { recursive: true, force: true });
    });

    it('should resolve the submodule’s own remote, not the parent’s', async () => {
      const intent = await resolveGitConnectIntent(client, submodulePath, true);

      expect(intent).not.toBeNull();
      // The submodule is its own repo root, so the Project links to the
      // submodule's remote with no root directory.
      expect(intent?.repoInfo.repo).toEqual('child-repo');
      expect(intent?.rootDirectory).toBeNull();
    });
  });
});
