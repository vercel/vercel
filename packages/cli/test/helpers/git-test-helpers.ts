import { execSync } from 'node:child_process';
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
