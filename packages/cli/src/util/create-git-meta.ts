import fs from 'fs-extra';
import { join } from 'path';
import ini from 'ini';
import git from 'git-last-commit';
import { exec } from 'child_process';
import type { CiMetadata, GitMetadata, Project } from '@vercel-internals/types';
import { errorToString, normalizeError } from '@vercel/error-utils';
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

  let ciMetadata: CiMetadata = {};
  if (process.env.GITHUB_ACTIONS && process.env.GITHUB_ACTOR) {
    // https://docs.github.com/en/actions/reference/variables-reference
    ciMetadata = {
      ci: true,
      ciType: 'github-actions' as const,
      // The username of the person or app that initiated the workflow.
      ciGitProviderUsername: process.env.GITHUB_ACTOR,
    };
  } else if (process.env.GITLAB_CI && process.env.GITLAB_USER_LOGIN) {
    // https://docs.gitlab.com/ci/variables/predefined_variables/
    ciMetadata = {
      ci: true,
      ciType: 'gitlab-ci-cd' as const,
      // The unique username of the user who started the pipeline, unless the job is a manual job.
      // In manual jobs, the value is the username of the user who started the job.
      ciGitProviderUsername: process.env.GITLAB_USER_LOGIN,
      // Only GitLab CI/CD provides the visibility of the repository
      ciGitRepoVisibility: process.env.CI_PROJECT_VISIBILITY as
        | 'public'
        | 'private'
        | 'internal'
        | undefined,
    };
  } else if (process.env.BITBUCKET_PIPELINE_UUID) {
    // https://support.atlassian.com/bitbucket-cloud/docs/variables-and-secrets/
    ciMetadata = {
      ci: true,
      // Bitbucket Pipelines does not provide usernames in the environment variables
      ciType: 'bitbucket-pipelines' as const,
    };
  } else if (process.env.CI) {
    // Unknown CI environment
    ciMetadata = {
      ci: true,
    };
  }

  return {
    remoteUrl: remoteUrl || undefined,
    commitAuthorName: commit.author.name,
    commitAuthorEmail: commit.author.email,
    commitMessage: commit.subject,
    commitRef: commit.branch,
    commitSha: commit.hash,
    dirty,
    ...ciMetadata,
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
