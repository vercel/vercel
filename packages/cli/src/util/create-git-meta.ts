import fs from 'fs-extra';
import { join } from 'path';
import ini from 'ini';
import { exec, execFile } from 'child_process';
import type { GitMetadata, Project } from '@vercel-internals/types';
import { errorToString } from '@vercel/error-utils';
import output from '../output-manager';

export async function createGitMeta(
  directory: string,
  project?: Project | null
): Promise<GitMetadata | undefined> {
  // If a Git repository is already connected via `vc git`, use that remote url
  let remoteUrl;
  if (project?.link) {
    // in the form of org/repo
    const { repo } = project.link;

    const remoteUrls = await getRemoteUrls(join(directory, '.git/config'));
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
    remoteUrl = await getOriginUrl(join(directory, '.git/config'));
  }

  const [commitResult, dirtyResult] = await Promise.allSettled([
    getLastCommit(directory),
    isDirty(directory),
  ]);

  if (commitResult.status === 'rejected') {
    output.debug(
      `Failed to get last commit. The directory is likely not a Git repo, there are no latest commits, or it is corrupted.\n${commitResult.reason}`
    );
    return;
  }

  if (dirtyResult.status === 'rejected') {
    output.debug(
      `Failed to determine if Git repo has been modified:\n${dirtyResult.reason}`
    );
    return;
  }

  const dirty = dirtyResult.value;
  const commit = commitResult.value;

  return {
    remoteUrl: remoteUrl || undefined,
    commitAuthorName: commit.authorName,
    commitAuthorEmail: commit.authorEmail,
    commitMessage: commit.subject,
    commitRef: commit.branch,
    commitSha: commit.hash,
    dirty,
  };
}

interface CommitInfo {
  hash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  branch: string;
}

function getLastCommit(directory: string): Promise<CommitInfo> {
  return new Promise((resolve, reject) => {
    // Fetch commit metadata and branch name with two separate commands
    // instead of the old `git-last-commit` package, which chained three
    // commands (`git log && git rev-parse && git tag --contains HEAD`)
    // with `&&` and treated ANY stderr as a fatal error.  That made
    // metadata collection silently fail whenever git printed a warning
    // (e.g. newer git versions, large repos, missing notes refs).
    execFile(
      'git',
      ['log', '-1', '--format=%H%n%s%n%an%n%ae'],
      { cwd: directory },
      (logErr, logStdout) => {
        if (logErr || !logStdout.trim()) {
          return reject(logErr || new Error('No git commits found'));
        }

        const lines = logStdout.trimEnd().split('\n');
        const [hash, subject, authorName, authorEmail] = lines;

        execFile(
          'git',
          ['rev-parse', '--abbrev-ref', 'HEAD'],
          { cwd: directory },
          (branchErr, branchStdout) => {
            const branch = branchErr ? '' : branchStdout.trim();
            resolve({ hash, subject, authorName, authorEmail, branch });
          }
        );
      }
    );
  });
}

export function isDirty(directory: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // note: we specify the `--no-optional-locks` git flag so that `git status`
    // does not perform any "optional" operations such as optimizing the index
    // in the background: https://git-scm.com/docs/git-status#_background_refresh
    exec(
      'git --no-optional-locks status -s',
      { cwd: directory },
      function (err, stdout, stderr) {
        if (err) {
          return reject(err);
        }
        if (stderr !== undefined && stderr.trim().length > 0) {
          return reject(new Error(stderr));
        }

        // Example output (when dirty):
        //    M ../fs-detectors/src/index.ts
        resolve(stdout.trim().length > 0);
      }
    );
  });
}

export async function parseGitConfig(configPath: string) {
  try {
    return ini.parse(await fs.readFile(configPath, 'utf-8'));
  } catch (err: unknown) {
    output.debug(`Error while parsing repo data: ${errorToString(err)}`);
  }
}

export function pluckRemoteUrls(gitConfig: {
  [key: string]: any;
}): { [key: string]: string } | undefined {
  const remoteUrls: { [key: string]: string } = {};

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
  configPath: string
): Promise<{ [key: string]: string } | undefined> {
  const config = await parseGitConfig(configPath);
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

export async function getOriginUrl(configPath: string): Promise<string | null> {
  const gitConfig = await parseGitConfig(configPath);
  if (!gitConfig) {
    return null;
  }

  const originUrl = pluckOriginUrl(gitConfig);
  if (originUrl) {
    return originUrl;
  }
  return null;
}
