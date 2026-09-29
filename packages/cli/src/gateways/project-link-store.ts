import type { ProjectLink } from '@vercel-internals/types';
import { isErrnoException } from '@vercel/error-utils';
import { readRepoLink, type RepoProjectsConfig } from '../util/link/repo';
import { getLinkFromDir, getVercelDirectory } from '../util/projects/link';
import { gatewayErrorFromCause, type OptionalResult } from './result';

export type RepoLinkInfo = {
  rootPath: string;
  repoConfigPath: string;
  repoConfig: RepoProjectsConfig | undefined;
};

/**
 * Local project links: `.vercel/project.json` and `.vercel/repo.json`. The
 * live gateway owns the filesystem and the `git rev-parse` repo-root probe.
 */
export type ProjectLinkStore = {
  /**
   * Reads the project link in `dir`. Conflicting `.vercel`/`.now`
   * directories and invalid link files are errors.
   */
  readProjectLink(input: { dir: string }): Promise<OptionalResult<ProjectLink>>;
  /** Finds the repository root above `cwd` and its `repo.json`, if any. */
  findRepoLink(input: { cwd: string }): Promise<OptionalResult<RepoLinkInfo>>;
};

function errorCode(err: unknown): string {
  return isErrnoException(err) && typeof err.code === 'string'
    ? err.code
    : 'read_failed';
}

export function liveProjectLinkStore(): ProjectLinkStore {
  return {
    async readProjectLink({ dir }) {
      try {
        const link = await getLinkFromDir<ProjectLink>(getVercelDirectory(dir));
        return link ? { type: 'found', value: link } : { type: 'missing' };
      } catch (err: unknown) {
        return {
          type: 'error',
          error: gatewayErrorFromCause(errorCode(err), err),
        };
      }
    },
    async findRepoLink({ cwd }) {
      try {
        const repoLink = await readRepoLink(cwd);
        if (!repoLink) {
          return { type: 'missing' };
        }
        return {
          type: 'found',
          value: {
            rootPath: repoLink.rootPath,
            repoConfigPath: repoLink.repoConfigPath,
            repoConfig: repoLink.repoConfig,
          },
        };
      } catch (err: unknown) {
        return {
          type: 'error',
          error: gatewayErrorFromCause(errorCode(err), err),
        };
      }
    },
  };
}
