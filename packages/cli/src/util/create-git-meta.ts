import fs from 'fs-extra';
import { join } from 'path';
import ini from 'ini';
import git from 'git-last-commit';
import { exec } from 'child_process';
import { GitMetadata, Project } from '../types';
import { Output } from './output';
import { errorToString } from './is-error';

export async function createGitMeta(
  directory: string,
  output: Output,
  project?: Project | null
): Promise<GitMetadata | undefined> {
  // If a Git repository is already connected via `vc git`, use that remote url
  let remoteUrl;
  if (project?.link) {
    // in the form of org/repo
    const { repo } = project.link;

    const remoteUrls = await getRemoteUrls(
      join(directory, '.git/config'),
      output
    );
    if (remoteUrls) {
      for (const urlValue of Object.values(remoteUrls)) {
        if (urlValue.includes(repo)) {
          remoteUrl = urlValue;
        }
      }
    }
  }

  // If we couldn't get a remote url from the connected repo, default to the origin url
  if (!remoteUrl) {
    remoteUrl = await getOriginUrl(join(directory, '.git/config'), output);
  }
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

export function isDirty(directory: string, output: Output): Promise<boolean> {
  return new Promise(resolve => {
    // note: we specify the `--no-optional-locks` git flag so that `git status`
    // does not perform any "optional" operations such as optimizing the index
    // in the background: https://git-scm.com/docs/git-status#_background_refresh
    exec(
      'git --no-optional-locks status -s',
      { cwd: directory },
      function (err, stdout, stderr) {
        let debugMessage = `Failed to determine if Git repo has been modified:`;
        if (err || stderr) {
          if (err) debugMessage += `\n${err}`;
          if (stderr) debugMessage += `\n${stderr.trim()}`;
          output.debug(debugMessage);
          return resolve(false);
        }
        resolve(stdout.trim().length > 0);
      }
    );
  });
}

export async function parseGitConfig(configPath: string, output: Output) {
  try {
    return ini.parse(await fs.readFile(configPath, 'utf-8'));
  } catch (err: unknown) {
    output.debug(`Error while parsing repo data: ${errorToString(err)}`);
  }
}

export function pluckRemoteUrls(gitConfig: {
  [key: string]: any;
}): { [key: string]: string } | undefined {
  let remoteUrls: { [key: string]: string } = {};

  for (const key of Object.keys(gitConfig)) {
    if (key.includes('remote')) {
      // ex. remote "origin" — matches origin
      const remoteName = key.match(/(?<=").*(?=")/g)?.[0];
      const remoteUrl = gitConfig[key]?.url;
      if (remoteName && remoteUrl) {
        remoteUrls[remoteName] = remoteUrl;
      }
    }
  }

  if (Object.keys(remoteUrls).length === 0) {
    return;
  }

  return remoteUrls;
}

export async function getRemoteUrls(
  configPath: string,
  output: Output
): Promise<{ [key: string]: string } | undefined> {
  const config = await parseGitConfig(configPath, output);
  if (!config) {
    return;
  }

  const remoteUrls = pluckRemoteUrls(config);
  return remoteUrls;
}

export function pluckOriginUrl(gitConfig: {
  [key: string]: any;
}): string | undefined {
  // Assuming "origin" is the remote url that the user would want to use
  return gitConfig['remote "origin"']?.url;
}

export async function getOriginUrl(
  configPath: string,
  output: Output
): Promise<string | null> {
  let gitConfig = await parseGitConfig(configPath, output);
  if (!gitConfig) {
    return null;
  }

  const originUrl = pluckOriginUrl(gitConfig);
  if (originUrl) {
    return originUrl;
  }
  return null;
}
