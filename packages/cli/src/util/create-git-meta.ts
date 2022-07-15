import fs from 'fs-extra';
import { join } from 'path';
import ini from 'ini';
import git from 'git-last-commit';
import { exec } from 'child_process';
import { GitMetadata } from '../types';
import { Output } from './output';

export function isDirty(directory: string, output: Output): Promise<boolean> {
  return new Promise(resolve => {
    exec('git status -s', { cwd: directory }, function (err, stdout, stderr) {
      let debugMessage = `Failed to determine if Git repo has been modified:`;
      if (err || stderr) {
        if (err) debugMessage += `\n${err}`;
        if (stderr) debugMessage += `\n${stderr.trim()}`;
        output.debug(debugMessage);
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

export async function parseGitConfig(configPath: string, output: Output) {
  try {
    return ini.parse(await fs.readFile(configPath, 'utf-8'));
  } catch (error) {
    output.debug(`Error while parsing repo data: ${error.message}`);
  }
}

export function pluckRemoteUrl(gitConfig: {
  [key: string]: any;
}): string | undefined {
  // Assuming "origin" is the remote url that the user would want to use
  return gitConfig['remote "origin"']?.url;
}

export async function getRemoteUrl(
  configPath: string,
  output: Output
): Promise<string | null> {
  let gitConfig = await parseGitConfig(configPath, output);
  if (!gitConfig) {
    return null;
  }

  const originUrl = pluckRemoteUrl(gitConfig);
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
    getLastCommit(directory).catch(err => {
      output.debug(
        `Failed to get last commit. The directory is likely not a Git repo, there are no latest commits, or it is corrupted.\n${err}`
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
