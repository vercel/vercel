import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'path';
import fs from 'fs-extra';

/**
 * Initialize a git repository with optional remotes.
 * Creates user config and an initial empty commit so HEAD exists.
 */
export function initGitRepo(
  cwd: string,
  remotes: Record<string, string> = {}
): void {
  try {
    execSync('git init', { cwd, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd, stdio: 'pipe' });
    for (const [name, url] of Object.entries(remotes)) {
      execSync(`git remote add ${name} ${url}`, { cwd, stdio: 'pipe' });
    }
    execSync('git commit --allow-empty -m "initial"', { cwd, stdio: 'pipe' });
  } catch (error) {
    throw new Error(
      `Failed to initialize git repo in ${cwd}: ${error instanceof Error ? error.message : error}`
    );
  }
}

/**
 * Initialize a bare git repository (for worktree testing).
 */
export function initBareGitRepo(
  cwd: string,
  remotes?: Record<string, string>
): void {
  try {
    execSync('git init --bare', { cwd, stdio: 'pipe' });
    for (const [name, url] of Object.entries(remotes ?? {})) {
      execSync(`git remote add ${name} ${url}`, { cwd, stdio: 'pipe' });
    }
  } catch (error) {
    throw new Error(
      `Failed to initialize bare git repo in ${cwd}: ${error instanceof Error ? error.message : error}`
    );
  }
}

/**
 * Setup a bare git repository with a worktree.
 * This is a common pattern for testing worktree scenarios.
 */
export function setupBareRepoWithWorktree(
  testDir: string,
  originUrl: string
): { bareRepoPath: string; worktreePath: string } {
  const bareRepoPath = join(testDir, 'repo.git');
  const worktreePath = join(testDir, 'worktree');

  // Initialize a bare repository with remote
  execSync('mkdir repo.git', { cwd: testDir });
  initBareGitRepo(bareRepoPath, { origin: originUrl });

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

  return { bareRepoPath, worktreePath };
}

/**
 * Create a .vercel/project.json file to simulate a linked project.
 */
export function createProjectLink(
  cwd: string,
  projectId: string,
  orgId: string = 'team_dummy'
): void {
  const vercelDir = join(cwd, '.vercel');
  fs.mkdirpSync(vercelDir);
  fs.writeJsonSync(join(vercelDir, 'project.json'), { orgId, projectId });
}
