import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'path';
import fs from 'fs-extra';
import os from 'os';
import { createGitMeta, isDirty } from '../../../../src/util/create-git-meta';
import { client } from '../../../mocks/client';
import { parseRepoUrl } from '../../../../src/util/git/connect-git-provider';
import { useUser } from '../../../mocks/user';
import { defaultProject, useProject } from '../../../mocks/project';
import type { Project } from '@vercel-internals/types';
import { vi } from 'vitest';
import output from '../../../../src/output-manager';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { initBareGitRepo } from '../../../helpers/git-test-helpers';

vi.setConfig({ testTimeout: 10 * 1000 });

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit/create-git-meta', name);

describe('parseRepoUrl', () => {
  it('should be null when a url does not match the regex', () => {
    const repoInfo = parseRepoUrl('https://examplecom/foo');
    expect(repoInfo).toBeNull();
  });
  it('should be null when a url does not contain org and repo data', () => {
    const repoInfo = parseRepoUrl('https://github.com/borked');
    expect(repoInfo).toBeNull();
  });
  it('should parse url with `.com` in the repo name', () => {
    const repoInfo = parseRepoUrl('https://github.com/vercel/vercel.com.git');
    expect(repoInfo).toBeTruthy();
    expect(repoInfo?.provider).toEqual('github');
    expect(repoInfo?.org).toEqual('vercel');
    expect(repoInfo?.repo).toEqual('vercel.com');
  });
  it('should parse url with a period in the repo name', () => {
    const repoInfo = parseRepoUrl('https://github.com/vercel/next.js');
    expect(repoInfo).toBeTruthy();
    expect(repoInfo?.provider).toEqual('github');
    expect(repoInfo?.org).toEqual('vercel');
    expect(repoInfo?.repo).toEqual('next.js');
  });
  it('should parse url that ends with .git', () => {
    const repoInfo = parseRepoUrl('https://github.com/vercel/next.js.git');
    expect(repoInfo).toBeTruthy();
    expect(repoInfo?.provider).toEqual('github');
    expect(repoInfo?.org).toEqual('vercel');
    expect(repoInfo?.repo).toEqual('next.js');
  });
  it('should parse github https url', () => {
    const repoInfo = parseRepoUrl('https://github.com/vercel/vercel.git');
    expect(repoInfo).toBeTruthy();
    expect(repoInfo?.provider).toEqual('github');
    expect(repoInfo?.org).toEqual('vercel');
    expect(repoInfo?.repo).toEqual('vercel');
  });
  it('should parse github https url without the .git suffix', () => {
    const repoInfo = parseRepoUrl('https://github.com/vercel/vercel');
    expect(repoInfo).toBeTruthy();
    expect(repoInfo?.provider).toEqual('github');
    expect(repoInfo?.org).toEqual('vercel');
    expect(repoInfo?.repo).toEqual('vercel');
  });
  it('should parse github git url', () => {
    const repoInfo = parseRepoUrl('git://github.com/vercel/vercel.git');
    expect(repoInfo).toBeTruthy();
    expect(repoInfo?.provider).toEqual('github');
    expect(repoInfo?.org).toEqual('vercel');
    expect(repoInfo?.repo).toEqual('vercel');
  });
  it('should parse github git url with trailing slash', () => {
    const repoInfo = parseRepoUrl('git://github.com/vercel/vercel.git/');
    expect(repoInfo).toBeTruthy();
    expect(repoInfo?.provider).toEqual('github');
    expect(repoInfo?.org).toEqual('vercel');
    expect(repoInfo?.repo).toEqual('vercel');
  });
  it('should parse github ssh url', () => {
    const repoInfo = parseRepoUrl('git@github.com:vercel/vercel.git');
    expect(repoInfo).toBeTruthy();
    expect(repoInfo?.provider).toEqual('github');
    expect(repoInfo?.org).toEqual('vercel');
    expect(repoInfo?.repo).toEqual('vercel');
  });

  it('should parse gitlab https url', () => {
    const repoInfo = parseRepoUrl(
      'https://gitlab.com/gitlab-examples/knative-kotlin-app.git'
    );
    expect(repoInfo).toBeTruthy();
    expect(repoInfo?.provider).toEqual('gitlab');
    expect(repoInfo?.org).toEqual('gitlab-examples');
    expect(repoInfo?.repo).toEqual('knative-kotlin-app');
  });
  it('should parse gitlab ssh url', () => {
    const repoInfo = parseRepoUrl(
      'git@gitlab.com:gitlab-examples/knative-kotlin-app.git'
    );
    expect(repoInfo).toBeTruthy();
    expect(repoInfo?.provider).toEqual('gitlab');
    expect(repoInfo?.org).toEqual('gitlab-examples');
    expect(repoInfo?.repo).toEqual('knative-kotlin-app');
  });
  it('should parse gitlab subgroup https url', () => {
    const repoInfo = parseRepoUrl(
      'https://gitlab.com/group/subgroup/project.git'
    );
    expect(repoInfo).toBeTruthy();
    expect(repoInfo?.provider).toEqual('gitlab');
    expect(repoInfo?.org).toEqual('group/subgroup');
    expect(repoInfo?.repo).toEqual('project');
  });

  it('should parse bitbucket https url', () => {
    const repoInfo = parseRepoUrl(
      'https://bitbucket.org/atlassianlabs/maven-project-example.git'
    );
    expect(repoInfo).toBeTruthy();
    expect(repoInfo?.provider).toEqual('bitbucket');
    expect(repoInfo?.org).toEqual('atlassianlabs');
    expect(repoInfo?.repo).toEqual('maven-project-example');
  });
  it('should parse bitbucket ssh url', () => {
    const repoInfo = parseRepoUrl(
      'git@bitbucket.org:atlassianlabs/maven-project-example.git'
    );
    expect(repoInfo).toBeTruthy();
    expect(repoInfo?.provider).toEqual('bitbucket');
    expect(repoInfo?.org).toEqual('atlassianlabs');
    expect(repoInfo?.repo).toEqual('maven-project-example');
  });
  it('should parse url without a scheme', () => {
    const parsedUrl = parseRepoUrl('github.com/user/repo');
    expect(parsedUrl?.provider).toEqual('github');
    expect(parsedUrl?.org).toEqual('user');
    expect(parsedUrl?.repo).toEqual('repo');
  });
  it('should parse a url that includes www.', () => {
    const parsedUrl = parseRepoUrl('www.github.com/user/repo');
    expect(parsedUrl?.provider).toEqual('github');
    expect(parsedUrl?.org).toEqual('user');
    expect(parsedUrl?.repo).toEqual('repo');
  });
});

describe('createGitMeta', () => {
  it('is undefined when it does not receive a remote url', async () => {
    const directory = fixture('no-origin');
    try {
      await fs.rename(join(directory, 'git'), join(directory, '.git'));
      const data = await createGitMeta(directory);
      expect(data).toEqual({
        commitAuthorEmail: 'mattbstanciu@gmail.com',
        commitAuthorName: 'Matthew Stanciu',
        commitMessage: 'hi',
        commitRef: 'master',
        commitSha: '0499dbfa2f58cd8b3b3ce5b2c02a24200862ac97',
        dirty: false,
        remoteUrl: undefined,
      });
    } finally {
      await fs.rename(join(directory, '.git'), join(directory, 'git'));
    }
  });
  it('detects dirty commit', async () => {
    const directory = fixture('dirty');
    try {
      await fs.rename(join(directory, 'git'), join(directory, '.git'));
      const dirty = await isDirty(directory);
      expect(dirty).toBeTruthy();
    } finally {
      await fs.rename(join(directory, '.git'), join(directory, 'git'));
    }
  });
  it('detects not dirty commit', async () => {
    const directory = fixture('not-dirty');
    try {
      await fs.rename(join(directory, 'git'), join(directory, '.git'));
      const dirty = await isDirty(directory);
      expect(dirty).toBeFalsy();
    } finally {
      await fs.rename(join(directory, '.git'), join(directory, 'git'));
    }
  });
  it('gets git metata from test-github', async () => {
    const directory = fixture('test-github');
    try {
      await fs.rename(join(directory, 'git'), join(directory, '.git'));
      const data = await createGitMeta(directory);
      expect(data).toMatchObject({
        remoteUrl: 'https://github.com/user/repo.git',
        commitAuthorName: 'Matthew Stanciu',
        commitMessage: 'hi',
        commitRef: 'master',
        commitSha: '0499dbfa2f58cd8b3b3ce5b2c02a24200862ac97',
        dirty: false,
      });
    } finally {
      await fs.rename(join(directory, '.git'), join(directory, 'git'));
    }
  });
  it('gets git metadata from test-github when there are uncommitted changes', async () => {
    const directory = fixture('test-github-dirty');
    try {
      await fs.rename(join(directory, 'git'), join(directory, '.git'));
      const data = await createGitMeta(directory);
      expect(data).toMatchObject({
        remoteUrl: 'https://github.com/user/repo.git',
        commitAuthorName: 'Matthew Stanciu',
        commitMessage: 'hi',
        commitRef: 'master',
        commitSha: 'dfe1724998d3651f713380bc134f8ef28abecef9',
        dirty: true,
      });
    } finally {
      await fs.rename(join(directory, '.git'), join(directory, 'git'));
    }
  });
  it('gets git metadata from test-gitlab', async () => {
    const directory = fixture('test-gitlab');
    try {
      await fs.rename(join(directory, 'git'), join(directory, '.git'));
      const data = await createGitMeta(directory);
      expect(data).toMatchObject({
        remoteUrl: 'https://gitlab.com/user/repo.git',
        commitAuthorName: 'Matthew Stanciu',
        commitMessage: 'hi',
        commitRef: 'master',
        commitSha: '328fa04e4363b462ad96a7180d67d2785bace650',
        dirty: false,
      });
    } finally {
      await fs.rename(join(directory, '.git'), join(directory, 'git'));
    }
  });
  it('gets git metadata from test-bitbucket', async () => {
    const directory = fixture('test-bitbucket');
    try {
      await fs.rename(join(directory, 'git'), join(directory, '.git'));
      const data = await createGitMeta(directory);
      expect(data).toMatchObject({
        remoteUrl: 'https://bitbucket.org/user/repo.git',
        commitAuthorName: 'Matthew Stanciu',
        commitMessage: 'hi',
        commitRef: 'master',
        commitSha: '3d883ccee5de4222ef5f40bde283a57b533b1256',
        dirty: false,
      });
    } finally {
      await fs.rename(join(directory, '.git'), join(directory, 'git'));
    }
  });
  it('fails when `.git` is corrupt', async () => {
    const directory = fixture('git-corrupt');
    const tmpDir = join(os.tmpdir(), 'git-corrupt');
    try {
      // Copy the fixture into a temp dir so that we don't pick
      // up Git information from the `vercel/vercel` repo itself
      await fs.copy(directory, tmpDir);
      await fs.rename(join(tmpDir, 'git'), join(tmpDir, '.git'));

      output.initialize({ debug: true });
      const data = await createGitMeta(tmpDir);

      // Should see debug messages about failures and return undefined
      await expect(client.stderr).toOutput(
        `Failed to get last commit. The directory is likely not a Git repo, there are no latest commits, or it is corrupted.`
      );

      expect(data).toBeUndefined();
    } finally {
      await fs.remove(tmpDir);
    }
  });
  it('uses the repo url for a connected project', async () => {
    const directory = fixture('connected-repo');
    client.cwd = directory;
    try {
      await fs.rename(join(directory, 'git'), join(directory, '.git'));

      useUser();
      const project = useProject({
        ...defaultProject,
        id: 'connected-repo',
        name: 'connected-repo',
      });
      project.project.link = {
        type: 'github',
        repo: 'user/repo2',
        repoId: 1010,
        gitCredentialId: '',
        sourceless: true,
        createdAt: 1656109539791,
        updatedAt: 1656109539791,
      };

      const data = await createGitMeta(directory, project.project as Project);
      expect(data).toMatchObject({
        remoteUrl: 'https://github.com/user/repo2',
        commitAuthorName: 'Matthew Stanciu',
        commitMessage: 'add hi',
        commitRef: 'master',
        commitSha: '8050816205303e5957b2909083c50677930d5b29',
        dirty: true,
      });
    } finally {
      await fs.rename(join(directory, '.git'), join(directory, 'git'));
    }
  });

  describe('bare repository worktree', () => {
    let testDir: string;
    let bareRepoPath: string;
    let worktreePath: string;
    let commitSha: string;

    beforeAll(() => {
      // Set up bare repo with worktree (same pattern as git-helpers.test.ts)
      testDir = setupTmpDir('create-git-meta-worktree-test');
      bareRepoPath = join(testDir, 'repo.git');
      worktreePath = join(testDir, 'worktree');

      // Initialize a bare repository with remote
      execSync('mkdir repo.git', { cwd: testDir });
      initBareGitRepo(bareRepoPath, {
        origin: 'https://github.com/user/repo.git',
      });

      // Create an initial commit in the bare repo (required to create a worktree).
      // We do this by creating a temporary clone, committing, and pushing.
      const tempClone = join(testDir, 'temp-clone');
      execSync(`git clone ${bareRepoPath} temp-clone`, { cwd: testDir });
      execSync('git config user.email "test@test.com"', { cwd: tempClone });
      execSync('git config user.name "Test User"', { cwd: tempClone });
      execSync('echo "hello" > README.md', { cwd: tempClone });
      execSync('git add .', { cwd: tempClone });
      execSync('git commit -m "initial commit"', { cwd: tempClone });
      commitSha = execSync('git rev-parse HEAD', { cwd: tempClone })
        .toString()
        .trim();
      execSync('git push origin HEAD:main', { cwd: tempClone });
      rmSync(tempClone, { recursive: true });

      // Create a worktree from the bare repo
      execSync(`git worktree add ${worktreePath} main`, { cwd: bareRepoPath });
    });

    it('gets git metadata from a worktree', async () => {
      const data = await createGitMeta(worktreePath);
      expect(data).toMatchObject({
        remoteUrl: 'https://github.com/user/repo.git',
        commitAuthorName: 'Test User',
        commitAuthorEmail: 'test@test.com',
        commitMessage: 'initial commit',
        commitRef: 'main',
        commitSha: commitSha,
        dirty: false,
      });
    });

    it('detects dirty state in a worktree', async () => {
      // Create an untracked file to make it dirty
      const untrackedFile = join(worktreePath, 'untracked.txt');
      fs.writeFileSync(untrackedFile, 'untracked content');

      try {
        const dirty = await isDirty(worktreePath);
        expect(dirty).toBeTruthy();

        const data = await createGitMeta(worktreePath);
        expect(data).toMatchObject({
          dirty: true,
        });
      } finally {
        // Clean up
        fs.unlinkSync(untrackedFile);
      }
    });
  });
});
