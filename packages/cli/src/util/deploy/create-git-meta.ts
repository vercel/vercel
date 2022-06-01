import fs from 'fs-extra';
import { join } from 'path';
import ini from 'ini';
import git from 'git-last-commit';
import { GitMeta } from '../../types';

function getLastCommit(directory: string): Promise<git.Commit> {
  return new Promise((resolve, reject) => {
    git.getLastCommit(
      (err, commit) => {
        if (err) reject(err);
        resolve(commit);
      },
      { dst: directory }
    );
  });
}

export async function getRepoData(configPath: string) {
  let gitConfig;
  try {
    gitConfig = ini.parse(await fs.readFile(configPath, 'utf-8'));
  } catch (error) {}
  if (!gitConfig) {
    return;
  }

  const originUrl = gitConfig['remote "origin"']?.url;
  if (originUrl) {
    // todo: extract proper provider name
    const provider = 'github';
    // Assumes GitHub right now
    const org = originUrl.split('/')[3];
    const repo = originUrl.split('/')[4].replace('.git', '');
    return {
      provider,
      org,
      repo,
    };
  }
}

export async function createGitMeta(directory: string): Promise<GitMeta> {
  let data: GitMeta = {};

  let gitConfig;
  try {
    gitConfig = ini.parse(
      await fs.readFile(join(directory, '.git/config'), 'utf-8')
    );
  } catch (error) {}
  if (!gitConfig) {
    return {};
  }

  const originUrl = gitConfig['remote "origin"']?.url;
  if (originUrl) {
    // Assumes GitHub right now
    data.githubOrg = originUrl.split('/')[3];
    data.githubRepo = originUrl.split('/')[4].replace('.git', '');
  }

  const commit = await getLastCommit(directory);
  data.githubCommitAuthorName = commit.author.name;
  data.githubCommitMessage = commit.subject;
  if (data.githubOrg) {
    data.githubCommitOrg = data.githubOrg;
  }
  data.githubCommitRef = commit.branch;
  if (data.githubRepo) {
    data.githubCommitRepo = data.githubRepo;
  }
  data.githubCommitSha = commit.hash;

  const userLogin = gitConfig.user;
  if (userLogin?.email && userLogin.email === commit.author.email) {
    data.githubCommitAuthorLogin = userLogin.name;
  }

  return data;
}
