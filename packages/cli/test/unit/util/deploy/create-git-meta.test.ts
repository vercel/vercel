import { join } from 'path';
import fs from 'fs-extra';
import os from 'os';
import { getWriteableDirectory } from '@vercel/build-utils';
import {
  createGitMeta,
  getRemoteUrl,
  isDirty,
} from '../../../../src/util/create-git-meta';
import { client } from '../../../mocks/client';
import { parseRepoUrl } from '../../../../src/util/projects/connect-git-provider';
import { readOutputStream } from '../../../helpers/read-output-stream';

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit/create-git-meta', name);

describe('getRemoteUrl', () => {
  it('does not provide data for no-origin', async () => {
    const configPath = join(fixture('no-origin'), 'git/config');
    const data = await getRemoteUrl(configPath, client.output);
    expect(data).toBeNull();
  });
  it('displays debug message when repo data cannot be parsed', async () => {
    const dir = await getWriteableDirectory();
    client.output.debugEnabled = true;
    const data = await getRemoteUrl(join(dir, 'git/config'), client.output);
    expect(data).toBeNull();
    await expect(client.stderr).toOutput('Error while parsing repo data');
  });
});

describe('parseRepoUrl', () => {
  it('should be null when a url does not match the regex', () => {
    const parsedUrl = parseRepoUrl('https://examplecom/foo');
    expect(parsedUrl).toBeNull();
  });
  it('should be null when a url does not contain org and repo data', () => {
    const parsedUrl = parseRepoUrl('https://github.com/borked');
    expect(parsedUrl).toBeNull();
  });
  it('should parse url with a period in the repo name', () => {
    const parsedUrl = parseRepoUrl('https://github.com/vercel/next.js');
    expect(parsedUrl).toBeDefined();
    expect(parsedUrl?.provider).toEqual('github');
    expect(parsedUrl?.org).toEqual('vercel');
    expect(parsedUrl?.repo).toEqual('next.js');
  });
  it('should parse url that ends with .git', () => {
    const parsedUrl = parseRepoUrl('https://github.com/vercel/next.js.git');
    expect(parsedUrl).toBeDefined();
    expect(parsedUrl?.provider).toEqual('github');
    expect(parsedUrl?.org).toEqual('vercel');
    expect(parsedUrl?.repo).toEqual('next.js');
  });
  it('should parse github https url', () => {
    const parsedUrl = parseRepoUrl('https://github.com/vercel/vercel.git');
    expect(parsedUrl).toBeDefined();
    expect(parsedUrl?.provider).toEqual('github');
    expect(parsedUrl?.org).toEqual('vercel');
    expect(parsedUrl?.repo).toEqual('vercel');
  });
  it('should parse github https url without the .git suffix', () => {
    const parsedUrl = parseRepoUrl('https://github.com/vercel/vercel');
    expect(parsedUrl).toBeDefined();
    expect(parsedUrl?.provider).toEqual('github');
    expect(parsedUrl?.org).toEqual('vercel');
    expect(parsedUrl?.repo).toEqual('vercel');
  });
  it('should parse github git url', () => {
    const parsedUrl = parseRepoUrl('git://github.com/vercel/vercel.git');
    expect(parsedUrl).toBeDefined();
    expect(parsedUrl?.provider).toEqual('github');
    expect(parsedUrl?.org).toEqual('vercel');
    expect(parsedUrl?.repo).toEqual('vercel');
  });
  it('should parse github ssh url', () => {
    const parsedUrl = parseRepoUrl('git@github.com:vercel/vercel.git');
    expect(parsedUrl).toBeDefined();
    expect(parsedUrl?.provider).toEqual('github');
    expect(parsedUrl?.org).toEqual('vercel');
    expect(parsedUrl?.repo).toEqual('vercel');
  });

  it('should parse gitlab https url', () => {
    const parsedUrl = parseRepoUrl(
      'https://gitlab.com/gitlab-examples/knative-kotlin-app.git'
    );
    expect(parsedUrl).toBeDefined();
    expect(parsedUrl?.provider).toEqual('gitlab');
    expect(parsedUrl?.org).toEqual('gitlab-examples');
    expect(parsedUrl?.repo).toEqual('knative-kotlin-app');
  });
  it('should parse gitlab ssh url', () => {
    const parsedUrl = parseRepoUrl(
      'git@gitlab.com:gitlab-examples/knative-kotlin-app.git'
    );
    expect(parsedUrl).toBeDefined();
    expect(parsedUrl?.provider).toEqual('gitlab');
    expect(parsedUrl?.org).toEqual('gitlab-examples');
    expect(parsedUrl?.repo).toEqual('knative-kotlin-app');
  });

  it('should parse bitbucket https url', () => {
    const parsedUrl = parseRepoUrl(
      'https://bitbucket.org/atlassianlabs/maven-project-example.git'
    );
    expect(parsedUrl).toBeDefined();
    expect(parsedUrl?.provider).toEqual('bitbucket');
    expect(parsedUrl?.org).toEqual('atlassianlabs');
    expect(parsedUrl?.repo).toEqual('maven-project-example');
  });
  it('should parse bitbucket ssh url', () => {
    const parsedUrl = parseRepoUrl(
      'git@bitbucket.org:atlassianlabs/maven-project-example.git'
    );
    expect(parsedUrl).toBeDefined();
    expect(parsedUrl?.provider).toEqual('bitbucket');
    expect(parsedUrl?.org).toEqual('atlassianlabs');
    expect(parsedUrl?.repo).toEqual('maven-project-example');
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
});
