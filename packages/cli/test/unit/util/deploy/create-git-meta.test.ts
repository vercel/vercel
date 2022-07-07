import { join } from 'path';
import fs from 'fs-extra';
import { getWriteableDirectory } from '@vercel/build-utils';
import {
  createGitMeta,
  getRemoteUrl,
  isDirty,
} from '../../../../src/util/deploy/create-git-meta';
import { client } from '../../../mocks/client';
import execa from 'execa';

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
  it('fails when `.git` is corrupt)', async () => {
    const directory = fixture('git-corrupt');
    try {
      await fs.rename(join(directory, 'git'), join(directory, '.git'));

      const data = await createGitMeta(directory, client.output);

      // `getLastCommit()` runs `git log -1`, which searches parent directories as well.
      // This test cannot return an undefined object for `data`, because it is running
      // in vercel/vercel, which has a Git repo. Howeer, if `data` matches the latest commit
      // to vercel/vercel, it means it did not find Git data in the `git-corrupt` fixture, which
      // means it is working as expected.
      const { stdout } = await execa('git', ['log', '-1']);
      const sha = getSha(stdout);
      expect(data?.commitSha).toEqual(sha);
    } finally {
      await fs.rename(join(directory, '.git'), join(directory, 'git'));
    }
  });
});

function getSha(stdout: string): string {
  const lines = stdout.split('\n');
  return lines[0].split(' ')[1];
}
