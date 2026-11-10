import fs from 'fs-extra';
import { join, relative, resolve } from 'path';
import ini from 'ini';
import { execFile } from 'child_process';
import type { GitMetadata, Project } from '@vercel-internals/types';
import { errorToString } from '@vercel/error-utils';
import output from '../output-manager';
import { getGitRootDirectory } from './git-helpers';
import { getGitExecutable } from './git-executable';
import { execFileAsync } from './exec-file';

export async function createGitMeta(
  directory: string,
  project?: Project | null
): Promise<GitMetadata | undefined> {
  const git = await getGitExecutable(directory);
  // These read-only queries are independent; avoid serializing status behind
  // repository discovery when Git metadata is on the deployment critical path.
  const metadata = Promise.allSettled([
    getLastCommit(directory, git),
    isDirty(directory),
  ]);
  let gitRoot: string;
  let branch: string;
  try {
    // Resolve the worktree root and branch together. A detached HEAD is
    // reported as HEAD; an unborn branch fails and has no commit metadata.
    const { stdout, stderr } = await execFileAsync(
      git,
      ['rev-parse', '--show-toplevel', '--abbrev-ref', 'HEAD'],
      { cwd: directory }
    );
    if (stderr.trim()) throw new Error(stderr);
    const lines = stdout.trim().split(/\r?\n/);
    branch = lines.pop()!;
    gitRoot = lines.join('\n');
  } catch (error) {
    // Drain concurrent Git processes before callers can remove the directory.
    await metadata;
    output.debug(
      `Failed to get last commit. The directory is likely not a Git repo, there are no latest commits, or it is corrupted.\n${errorToString(error)}`
    );
    return;
  }
  const gitConfigPath = join(gitRoot || directory, '.git/config');

  // If a Git repository is already connected via `vc git`, use that remote url
  let remoteUrl;
  if (project?.link) {
    // in the form of org/repo
    const { repo } = project.link;

    const remoteUrls = await getRemoteUrls(gitConfigPath);
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
    remoteUrl = await getOriginUrl(gitConfigPath);
  }

  const [commitResult, dirtyResult] = await metadata;

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
    commitAuthorName: commit.author.name,
    commitAuthorEmail: commit.author.email,
    commitMessage: commit.subject,
    commitRef: branch,
    commitSha: commit.hash,
    dirty,
    rootDirectory: getRootDirectory(directory, gitRoot),
  };
}

/**
 * Returns the deployed directory path relative to the git repository root.
 * Empty string when `directory` is the repository root.
 */
export function getRootDirectory(
  directory: string,
  gitRoot: string | null = getGitRootDirectory({ cwd: directory })
): string | undefined {
  if (!gitRoot) {
    return;
  }

  const rootDirectory = relative(gitRoot, resolve(directory)).replace(
    /\\/g,
    '/'
  );

  // Outside the repository (shouldn't happen when gitRoot was resolved from directory)
  if (rootDirectory === '..' || rootDirectory.startsWith('../')) {
    return;
  }

  return rootDirectory === '.' ? '' : rootDirectory;
}

async function getLastCommit(directory: string, git: string) {
  const commit = await execFileAsync(
    git,
    ['log', '-1', '--format=%H%x00%s%x00%an%x00%ae'],
    { cwd: directory }
  );
  if (commit.stderr) throw new Error(commit.stderr);
  const [hash, subject, name, email] = commit.stdout
    .replace(/\r?\n$/, '')
    .split('\0');
  return { hash, subject, author: { name, email } };
}

export async function isDirty(directory: string): Promise<boolean> {
  const git = await getGitExecutable(directory);
  return new Promise((resolve, reject) => {
    // note: we specify the `--no-optional-locks` git flag so that `git status`
    // does not perform any "optional" operations such as optimizing the index
    // in the background: https://git-scm.com/docs/git-status#_background_refresh
    execFile(
      git,
      ['--no-optional-locks', 'status', '-s'],
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
