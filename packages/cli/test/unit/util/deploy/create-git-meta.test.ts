import { join } from 'path';
import fs from 'fs-extra';
import {
  createGitMeta,
  getRepoData,
} from '../../../../src/util/deploy/create-git-meta';

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit/create-git-meta', name);

describe('getRepoData', () => {
  it('gets repo data for no-email', async () => {
    const configPath = join(fixture('no-email'), 'config');
    const data = await getRepoData(configPath);
    expect(data?.provider).toEqual('github');
    expect(data?.org).toEqual('MatthewStanciu');
    expect(data?.repo).toEqual('git-test');
  });
  it('gets repo data for no-origin', async () => {
    const configPath = join(fixture('no-origin'), 'config');
    const data = await getRepoData(configPath);
    expect(data).toBeUndefined();
  });
});

describe('createGitMeta', () => {
  it('gets git metata from test-1', async () => {
    const directory = fixture('test-1');
    try {
      await fs.rename(join(directory, 'git'), join(directory, '.git'));
      const data = await createGitMeta(directory);
      expect(data.githubOrg).toEqual('user');
      expect(data.githubRepo).toEqual('repo');
      expect(data.githubCommitAuthorName).toEqual('Matthew Stanciu');
      expect(data.githubCommitMessage).toEqual('hi');
      expect(data.githubCommitOrg).toEqual('user');
      expect(data.githubCommitRef).toEqual('master');
      expect(data.githubCommitRepo).toEqual('repo');
      expect(data.githubCommitSha).toEqual(
        '0499dbfa2f58cd8b3b3ce5b2c02a24200862ac97'
      );
    } finally {
      await fs.rename(join(directory, '.git'), join(directory, 'git'));
    }
  });
  // it("throws an error when the git config is empty or doesn't exist", () => {
  //   const result = createGitMeta('');
  //   expect(result).toBeUndefined();
  // });
  // it('does not contain user login name when git config does not contain email', () => {
  //   getLastCommit().then(commit => {
  //     const result = createGitMeta(fixture('no-email'));
  //     expect(result).toBe({});
  //   });
  //   const result = createGitMeta(fixture('no-email'));
  //   expect(result).toBe({
  //     githubOrg: 'MatthewStanciu',
  //     githubRepo: 'git-test',
  //     githubCommitAuthorName: 'Matthew Stanciu',
  //     githubCommitMessage: 'Initial commit',
  //     githubCommitOrg: 'MatthewStanciu',
  //     githubCommitRef: 'main',
  //     githubCommitRepo: 'git-test',
  //     githubCommitSha: '70724f51208984d6fa9a5cb81926f718d96623ea',
  //   });
  // });
  // it('org and repo are undefined when origin url is undefined', () => {
  //   const result = createGitMeta(fixture('no-origin'));
  //   expect(result).toBe({
  //     githubCommitAuthorName: 'Matthew Stanciu',
  //     githubCommitMessage: 'Initial commit',
  //     githubCommitRef: 'main',
  //     githubCommitSha: '70724f51208984d6fa9a5cb81926f718d96623ea',
  //   });
  // });
  // it('should return a full meta object', () => {
  //   const result = createGitMeta(
  //     join(__dirname, '../../../../../../../.git/config')
  //   );
  //   expect(result).toBe({
  //     githubCommitAuthorName: 'JJ Kasper',
  //     githubCommitMessage:
  //       'Revert "[next] Allow edge api endpoints in Next.js" (#7898)',
  //     githubCommitOrg: 'vercel',
  //     githubCommitRef: 'main',
  //     githubCommitRepo: 'vercel',
  //     githubCommitSha: 'd4cef69cc92b4f5878fa88a7b63b6c7e25d2505b',
  //     githubOrg: 'vercel',
  //     githubRepo: 'vercel',
  //   });
  // });

  /*
   * 1. Git config is empty or doesn't exist
   * 2. Git config doesn't contain email
   * 3. Git config doesn't contain origin url
   * 4. Last commit doesn't exist; getLastCommit() throws an error
   * 5. Last commit fetches correctly and git config contains email and origin url
   */
});
