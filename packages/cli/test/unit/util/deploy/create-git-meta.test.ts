import { join } from 'path';
import fs from 'fs-extra';
import os from 'os';
import { getWriteableDirectory } from '@vercel/build-utils';
import {
  createGitMeta,
  getOriginUrl,
  getRemoteUrls,
  isDirty,
} from '../../../../src/util/create-git-meta';
import { client } from '../../../mocks/client';
import { parseRepoUrl } from '../../../../src/util/git/connect-git-provider';
import { readOutputStream } from '../../../helpers/read-output-stream';
import { useUser } from '../../../mocks/user';
import { defaultProject, useProject } from '../../../mocks/project';
import { Project } from '../../../../src/types';

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit/create-git-meta', name);

describe('getOriginUrl', () => {
  it('does not provide data for no-origin', async () => {
    const configPath = join(fixture('no-origin'), 'git/config');
    const data = await getOriginUrl(configPath, client.output);
    expect(data).toBeNull();
  });
  it('displays debug message when repo data cannot be parsed', async () => {
    const dir = await getWriteableDirectory();
    client.output.debugEnabled = true;
    const data = await getOriginUrl(join(dir, 'git/config'), client.output);
    expect(data).toBeNull();
    await expect(client.stderr).toOutput('Error while parsing repo data');
  });
});

describe('getRemoteUrls', () => {
  it('does not provide data when there are no remote urls', async () => {
    const configPath = join(fixture('no-origin'), 'git/config');
    const data = await getRemoteUrls(configPath, client.output);
    expect(data).toBeUndefined();
  });
  it('returns an object when multiple urls are present', async () => {
    const configPath = join(fixture('multiple-remotes'), 'git/config');
    const data = await getRemoteUrls(configPath, client.output);
    expect(data).toMatchObject({
      origin: 'https://github.com/user/repo',
      secondary: 'https://github.com/user/repo2',
    });
  });
  it('returns an object for origin url', async () => {
    const configPath = join(fixture('test-github'), 'git/config');
    const data = await getRemoteUrls(configPath, client.output);
    expect(data).toMatchObject({
      origin: 'https://github.com/user/repo.git',
    });
  });
});

describe('parseRepoUrl', () => {
  it('should be null when a url does not match the regex', () => {
    const repoInfo = parseRepoUrl('https://examplecom/foo');
    expect(repoInfo).toBeNull();
  });
  it('should be null when a url does not contain org and repo data', () => {
    const repoInfo = parseRepoUrl('https://github.com/borked');
    expect(repoInfo).toBeNull();
  });
  it('should parse url with a period in the repo name', () => {
    const repoInfo = parseRepoUrl('https://github.com/vercel/next.js');
    expect(repoInfo).toBeDefined();
    expect(repoInfo?.provider).toEqual('github');
    expect(repoInfo?.org).toEqual('vercel');
    expect(repoInfo?.repo).toEqual('next.js');
  });
  it('should parse url that ends with .git', () => {
    const repoInfo = parseRepoUrl('https://github.com/vercel/next.js.git');
    expect(repoInfo).toBeDefined();
    expect(repoInfo?.provider).toEqual('github');
    expect(repoInfo?.org).toEqual('vercel');
    expect(repoInfo?.repo).toEqual('next.js');
  });
  it('should parse github https url', () => {
    const repoInfo = parseRepoUrl('https://github.com/vercel/vercel.git');
    expect(repoInfo).toBeDefined();
    expect(repoInfo?.provider).toEqual('github');
    expect(repoInfo?.org).toEqual('vercel');
    expect(repoInfo?.repo).toEqual('vercel');
  });
  it('should parse github https url without the .git suffix', () => {
    const repoInfo = parseRepoUrl('https://github.com/vercel/vercel');
    expect(repoInfo).toBeDefined();
    expect(repoInfo?.provider).toEqual('github');
    expect(repoInfo?.org).toEqual('vercel');
    expect(repoInfo?.repo).toEqual('vercel');
  });
  it('should parse github git url', () => {
    const repoInfo = parseRepoUrl('git://github.com/vercel/vercel.git');
    expect(repoInfo).toBeDefined();
    expect(repoInfo?.provider).toEqual('github');
    expect(repoInfo?.org).toEqual('vercel');
    expect(repoInfo?.repo).toEqual('vercel');
  });
  it('should parse github ssh url', () => {
    const repoInfo = parseRepoUrl('git@github.com:vercel/vercel.git');
    expect(repoInfo).toBeDefined();
    expect(repoInfo?.provider).toEqual('github');
    expect(repoInfo?.org).toEqual('vercel');
    expect(repoInfo?.repo).toEqual('vercel');
  });

  it('should parse gitlab https url', () => {
    const repoInfo = parseRepoUrl(
      'https://gitlab.com/gitlab-examples/knative-kotlin-app.git'
    );
    expect(repoInfo).toBeDefined();
    expect(repoInfo?.provider).toEqual('gitlab');
    expect(repoInfo?.org).toEqual('gitlab-examples');
    expect(repoInfo?.repo).toEqual('knative-kotlin-app');
  });
  it('should parse gitlab ssh url', () => {
    const repoInfo = parseRepoUrl(
      'git@gitlab.com:gitlab-examples/knative-kotlin-app.git'
    );
    expect(repoInfo).toBeDefined();
    expect(repoInfo?.provider).toEqual('gitlab');
    expect(repoInfo?.org).toEqual('gitlab-examples');
    expect(repoInfo?.repo).toEqual('knative-kotlin-app');
  });

  it('should parse bitbucket https url', () => {
    const repoInfo = parseRepoUrl(
      'https://bitbucket.org/atlassianlabs/maven-project-example.git'
    );
    expect(repoInfo).toBeDefined();
    expect(repoInfo?.provider).toEqual('bitbucket');
    expect(repoInfo?.org).toEqual('atlassianlabs');
    expect(repoInfo?.repo).toEqual('maven-project-example');
  });
  it('should parse bitbucket ssh url', () => {
    const repoInfo = parseRepoUrl(
      'git@bitbucket.org:atlassianlabs/maven-project-example.git'
    );
    expect(repoInfo).toBeDefined();
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
      const data = await createGitMeta(directory, client.output);
      expect(data).toBeUndefined();
    } finally {
      await fs.rename(join(directory, '.git'), join(directory, 'git'));
    }
  });
  it('detects dirty commit', async () => {
    const directory = fixture('dirty');
    try {
      await fs.rename(join(directory, 'git'), join(directory, '.git'));
      const dirty = await isDirty(directory, client.output);
      expect(dirty).toBeTruthy();
    } finally {
      await fs.rename(join(directory, '.git'), join(directory, 'git'));
    }
  });
  it('detects not dirty commit', async () => {
    const directory = fixture('not-dirty');
    try {
      await fs.rename(join(directory, 'git'), join(directory, '.git'));
      const dirty = await isDirty(directory, client.output);
      expect(dirty).toBeFalsy();
    } finally {
      await fs.rename(join(directory, '.git'), join(directory, 'git'));
    }
  });
  it('gets git metata from test-github', async () => {
    const directory = fixture('test-github');
    try {
      await fs.rename(join(directory, 'git'), join(directory, '.git'));
      const data = await createGitMeta(directory, client.output);
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
      const data = await createGitMeta(directory, client.output);
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
      const data = await createGitMeta(directory, client.output);
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
      const data = await createGitMeta(directory, client.output);
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

      client.output.debugEnabled = true;
      const data = await createGitMeta(tmpDir, client.output);

      const output = await readOutputStream(client, 2);

      expect(output).toContain(
        `Failed to get last commit. The directory is likely not a Git repo, there are no latest commits, or it is corrupted.`
      );
      expect(output).toContain(
        `Failed to determine if Git repo has been modified:`
      );
      expect(data).toBeUndefined();
    } finally {
      await fs.remove(tmpDir);
    }
  });
  it('uses the repo url for a connected project', async () => {
    const originalCwd = process.cwd();
    const directory = fixture('connected-repo');
    try {
      process.chdir(directory);
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

      const data = await createGitMeta(
        directory,
        client.output,
        project.project as Project
      );
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
      process.chdir(originalCwd);
    }
  });
});
