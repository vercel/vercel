import fs from 'fs-extra';
import { join } from 'path';
import ini from 'ini';
import git from 'git-last-commit';
import { exec } from 'child_process';
import { GitMetadata } from '../../types';
import { Output } from '../output';

export function isDirty(directory: string, output: Output): Promise<boolean> {
  return new Promise(resolve => {
    exec('git status -s', { cwd: directory }, function (err, stdout, stderr) {
      if (err || stderr) {
        output.debug(
          `Failed to determine if git repo has been modified:\n${err}\n${stderr.trim()}`
        );
        return resolve(false);
      }
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
): Promise<GitMetadata | undefined> {
  const remoteUrl = await getRemoteUrl(join(directory, '.git/config'), output);
  // If we can't get the repo URL, then don't return any metadata
  if (!remoteUrl) {
    return;
  }
  const [commit, dirty] = await Promise.all([
    getLastCommit(directory).catch(() => {
      output.debug(
        'Failed to get last commit. The directory is likely not a Git repo, there are no latest commits, or it is corrupted.'
      );
      return;
    }),
    isDirty(directory, output),
  ]);

  if (!commit) {
    return;
  }

  return {
    remoteUrl,
    commitAuthorName: commit.author.name,
    commitMessage: commit.subject,
    commitRef: commit.branch,
    commitSha: commit.hash,
    dirty,
  };
}
