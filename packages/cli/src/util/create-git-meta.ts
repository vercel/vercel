import git from 'git-last-commit';
import { exec } from 'node:child_process';
import type { GitMetadata, Project } from '@vercel-internals/types';
import { normalizeError } from '@vercel/error-utils';
import output from '../output-manager';
import { getGitRemoteUrls, getGitOriginUrl } from './git-helpers';

export async function createGitMeta(
  directory: string,
  project?: Project | null
): Promise<GitMetadata | undefined> {
  // If a Git repository is already connected via `vc git`, use that remote url
  let remoteUrl: string | null | undefined;
  if (project?.link) {
    // in the form of org/repo
    const { repo } = project.link;

    const remoteUrls = await getGitRemoteUrls({ cwd: directory });
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
    remoteUrl = await getGitOriginUrl({ cwd: directory });
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
    commitAuthorName: commit.author.name,
    commitAuthorEmail: commit.author.email,
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
        if (err) {
          return reject(normalizeError(err));
        }

        resolve(commit);
      },
      { dst: directory }
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
