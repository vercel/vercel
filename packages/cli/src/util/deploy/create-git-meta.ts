import fs from 'fs-extra';
import { join } from 'path';
import ini from 'ini';
import git from 'git-last-commit';
import process from 'child_process';
import {
  BitbucketMeta,
  GitHubMeta,
  GitLabMeta,
  GitMeta,
  RepoData,
} from '../../types';
import { Output } from '../output';

export function isDirty(directory: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    process.exec(
      'git status -s',
      { cwd: directory },
      function (err, stdout, stderr) {
        if (err) return reject(err);
        if (stderr) return reject(new Error(stderr));
        resolve(stdout.trim().length > 0);
      }
    );
  });
}

function getLastCommit(directory: string): Promise<git.Commit> {
  return new Promise((resolve, reject) => {
    git.getLastCommit(
      (err, commit) => {
        if (err) return reject(err);
        resolve(commit);
      },
      { dst: directory }
    );
  });
}

export async function getRepoData(
  configPath: string,
  output: Output
): Promise<RepoData | null> {
  let gitConfig;
  try {
    gitConfig = ini.parse(await fs.readFile(configPath, 'utf-8'));
  } catch (error) {
    output.debug(`Error while parsing repo data: ${error.message}`);
  }
  if (!gitConfig) {
    return null;
  }

  const originUrl = gitConfig['remote "origin"']?.url;
  if (originUrl) {
    return parseRepoUrl(originUrl);
  }
  return null;
}

export function parseRepoUrl(originUrl: string): RepoData | null {
  const isSSH = originUrl.startsWith('git@');
  // Matches all characters between (// or @) and (.com or .org)
  const provider = originUrl.match(/(?<=(\/\/|@)).*(?=(\.com|\.org))/);
  if (!provider) {
    return null;
  }

  let org;
  let repo;

  if (isSSH) {
    org = originUrl.split(':')[1].split('/')[0];
    repo = originUrl.split('/')[1]?.replace('.git', '');
  } else {
    // Assume https:// or git://
    org = originUrl.split('/')[3];
    repo = originUrl.split('/')[4]?.replace('.git', '');
  }

  if (!org || !repo) {
    return null;
  }

  return {
    provider: provider[0],
    org,
    repo,
  };
}

export async function createGitMeta(
  directory: string,
  output: Output
): Promise<GitMeta> {
  const repoData = await getRepoData(join(directory, '.git/config'), output);
  // If we can't get the repo URL, then don't return any metadata
  if (!repoData) {
    return {};
  }
  const [commit, dirty] = await Promise.all([
    getLastCommit(directory),
    isDirty(directory),
  ]);

  if (repoData.provider === 'github') {
    return populateGitHubData(repoData, commit, dirty);
  } else if (repoData.provider === 'gitlab') {
    return populateGitLabData(repoData, commit, dirty);
  } else if (repoData.provider === 'bitbucket') {
    return populateBitbucketData(repoData, commit, dirty);
  }

  return {};
}

// Populate data for every provider

function populateGitHubData(
  repoData: RepoData,
  commit: git.Commit,
  dirty: boolean
): GitHubMeta {
  const data: GitHubMeta = {};

  if (dirty) {
    data.gitDirty = '1';
  }

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
  repoData: RepoData,
  commit: git.Commit,
  dirty: boolean
): GitLabMeta {
  const data: GitLabMeta = {};

  if (dirty) {
    data.gitDirty = '1';
  }

  if (repoData.org && repoData.repo) {
    data.gitlabProjectPath = `${repoData.org}/${repoData.repo}`;
  }

  data.gitlabCommitAuthorName = commit.author.name;
  data.gitlabCommitMessage = commit.subject;
  data.gitlabCommitRef = commit.branch;
  data.gitlabCommitSha = commit.hash;
  data.gitlabDeployment = '1';

  return data;
}

function populateBitbucketData(
  repoData: RepoData,
  commit: git.Commit,
  dirty: boolean
): BitbucketMeta {
  const data: BitbucketMeta = {};

  if (dirty) {
    data.gitDirty = '1';
  }

  data.bitbucketRepoOwner = repoData.org;
  data.bitbucketRepoSlug = repoData.repo;
  data.bitbucketCommitAuthorName = commit.author.name;
  data.bitbucketCommitMessage = commit.subject;
  data.bitbucketCommitRef = commit.branch;
  data.bitbucketCommitSha = commit.hash;
  data.bitbucketDeployment = '1';

  return data;
}
