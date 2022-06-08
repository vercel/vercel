import fs from 'fs-extra';
import { join } from 'path';
import ini from 'ini';
import git from 'git-last-commit';
import { exec } from 'child_process';
import { GitMetadata } from '../../types';
import { Output } from '../output';

export function isDirty(directory: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    exec('git status -s', { cwd: directory }, function (err, stdout, stderr) {
      if (err) return reject(err);
      if (stderr)
        return reject(
          new Error(
            `Failed to determine if git repo has been modified: ${stderr.trim()}`
          )
        );
      resolve(stdout.trim().length > 0);
    });
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

export async function getRemoteUrl(
  configPath: string,
  output: Output
): Promise<string | null> {
  let gitConfig;
  try {
    gitConfig = ini.parse(await fs.readFile(configPath, 'utf-8'));
  } catch (error) {
    output.debug(`Error while parsing repo data: ${error.message}`);
  }
  if (!gitConfig) {
    return null;
  }

  const originUrl: string = gitConfig['remote "origin"']?.url;
  if (originUrl) {
    return originUrl;
  }
  return null;
}

export async function createGitMeta(
  directory: string,
  output: Output
): Promise<GitMetadata | null> {
  const remoteUrl = await getRemoteUrl(join(directory, '.git/config'), output);
  // If we can't get the repo URL, then don't return any metadata
  if (!remoteUrl) {
    return null;
  }
  const [commit, dirty] = await Promise.all([
    getLastCommit(directory),
    isDirty(directory),
  ]);

  return {
    remoteUrl,
    commitAuthorName: commit.author.name,
    commitMessage: commit.subject,
    commitRef: commit.branch,
    commitSha: commit.hash,
    dirty,
  };
}
