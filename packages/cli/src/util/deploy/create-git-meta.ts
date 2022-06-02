import fs from 'fs-extra';
import { join } from 'path';
import ini from 'ini';
import git from 'git-last-commit';
import {
  BitbucketMeta,
  GitHubMeta,
  GitLabMeta,
  GitMeta,
  RepoData,
} from '../../types';

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
    return parseRepoUrl(originUrl);
  }
}

export function parseRepoUrl(originUrl: string): RepoData | null {
  const isSSH = originUrl.startsWith('git@');
  // Matches all characters between (// or @) and (.com or .org)
  const provider = originUrl.match(/(?<=(\/\/|@)).*(?=(.com|.org))/);
  if (!provider) {
    return null;
  }

  let org;
  let repo;

  if (isSSH) {
    org = originUrl.split(':')[1].split('/')[0];
    repo = originUrl.split('/')[1].replace('.git', '');
  } else {
    // Assume https:// or git://
    org = originUrl.split('/')[3];
    repo = originUrl.split('/')[4].replace('.git', '');
  }

  return {
    provider: provider[0],
    org,
    repo,
  };
}

export async function createGitMeta(directory: string): Promise<GitMeta> {
  let githubData: GitHubMeta = {};
  let gitlabData: GitLabMeta = {};
  let bitbucketData: BitbucketMeta = {};

  const repoData = await getRepoData(join(directory, '.git/config'));
  // If we can't get the repo URL, then don't return any metadata
  if (!repoData) {
    return {};
  }
  const commit = await getLastCommit(directory);

  if (repoData.provider === 'github') {
    populateGitHubData(githubData, repoData, commit);
  } else if (repoData.provider === 'gitlab') {
    populateGitLabData(gitlabData, repoData, commit);
  } else if (repoData.provider === 'bitbucket') {
    populateBitbucketData(bitbucketData, repoData, commit);
  }

  if (Object.keys(githubData).length !== 0) {
    return githubData;
  } else if (Object.keys(gitlabData).length !== 0) {
    return gitlabData;
  } else if (Object.keys(bitbucketData).length !== 0) {
    return bitbucketData;
  } else {
    return {};
  }
}

// Functions to populate data for every provider

function populateGitHubData(
  data: GitHubMeta,
  repoData: RepoData,
  commit: git.Commit
): GitHubMeta {
  data.githubOrg = repoData.org;
  data.githubCommitOrg = repoData.org;
  data.githubRepo = repoData.repo;
  data.githubCommitRepo = repoData.repo;

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

  data.githubDeployment = '1';

  return data;
}

function populateGitLabData(
  data: GitLabMeta,
  repoData: RepoData,
  commit: git.Commit
): GitLabMeta {
  data.gitlabOrg = repoData.org;
  data.gitlabCommitOrg = repoData.org;
  data.gitlabRepo = repoData.repo;
  data.gitlabCommitRepo = repoData.repo;

  data.gitlabCommitAuthorName = commit.author.name;
  data.gitlabCommitMessage = commit.subject;
  if (data.gitlabOrg) {
    data.gitlabCommitOrg = data.gitlabOrg;
  }
  data.gitlabCommitRef = commit.branch;
  if (data.gitlabRepo) {
    data.gitlabCommitRepo = data.gitlabRepo;
  }
  data.gitlabCommitSha = commit.hash;
  data.gitlabDeployment = '1';

  return data;
}

function populateBitbucketData(
  data: BitbucketMeta,
  repoData: RepoData,
  commit: git.Commit
): BitbucketMeta {
  data.bitbucketOrg = repoData.org;
  data.bitbucketCommitOrg = repoData.org;
  data.bitbucketRepo = repoData.repo;
  data.bitbucketCommitRepo = repoData.repo;

  data.bitbucketCommitAuthorName = commit.author.name;
  data.bitbucketCommitMessage = commit.subject;
  if (data.bitbucketOrg) {
    data.bitbucketCommitOrg = data.bitbucketOrg;
  }
  data.bitbucketCommitRef = commit.branch;
  if (data.bitbucketRepo) {
    data.bitbucketCommitRepo = data.bitbucketRepo;
  }
  data.bitbucketCommitSha = commit.hash;
  data.bitbucketDeployment = '1';

  return data;
}
