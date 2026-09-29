import { dirname, join, resolve } from 'path';
import { NowBuildError } from '@vercel/build-utils';
import type { ProjectLink } from '@vercel-internals/types';
import type {
  ProjectLinkStore,
  RepoLinkInfo,
} from '../../src/gateways/project-link-store';
import type { OptionalResult } from '../../src/gateways/result';
import type { RepoProjectsConfig } from '../../src/util/link/repo';

export type FakeProjectLinkState =
  | ProjectLink
  /** Both `.vercel` and `.now` exist in the directory. */
  | { kind: 'conflicting-directories' }
  /** `project.json` exists but can't be read. */
  | { kind: 'invalid' };

export type FakeProjectLinkStoreState = {
  /** Project links keyed by project directory. */
  projectLinks?: Record<string, FakeProjectLinkState>;
  /**
   * Repositories keyed by root directory: a `repo.json` config, or
   * `'git-only'` for a Git repository without `repo.json`.
   */
  repos?: Record<string, RepoProjectsConfig | 'git-only'>;
};

/**
 * In-memory `ProjectLinkStore`. Repo lookup mirrors the live walk-up: the
 * nearest ancestor with `repo.json` wins, then the nearest Git root.
 */
export class FakeProjectLinkStore implements ProjectLinkStore {
  #projectLinks: Map<string, FakeProjectLinkState>;
  #repos: Map<string, RepoProjectsConfig | 'git-only'>;

  constructor(state: FakeProjectLinkStoreState = {}) {
    this.#projectLinks = new Map(
      Object.entries(state.projectLinks ?? {}).map(([dir, link]) => [
        resolve(dir),
        structuredClone(link),
      ])
    );
    this.#repos = new Map(
      Object.entries(state.repos ?? {}).map(([root, repo]) => [
        resolve(root),
        repo === 'git-only' ? repo : structuredClone(repo),
      ])
    );
  }

  async readProjectLink({
    dir,
  }: {
    dir: string;
  }): Promise<OptionalResult<ProjectLink>> {
    const link = this.#projectLinks.get(resolve(dir));
    if (!link) {
      return { type: 'missing' };
    }
    if ('kind' in link) {
      const cause =
        link.kind === 'conflicting-directories'
          ? new NowBuildError({
              code: 'CONFLICTING_CONFIG_DIRECTORIES',
              message:
                'Both `.vercel` and `.now` directories exist. Please remove the `.now` directory.',
              link: 'https://vercel.link/combining-old-and-new-config',
            })
          : new Error(
              `Project Settings could not be retrieved. To link your project again, remove the ${dir} directory.`
            );
      return {
        type: 'error',
        error: {
          code:
            link.kind === 'conflicting-directories'
              ? 'CONFLICTING_CONFIG_DIRECTORIES'
              : 'read_failed',
          message: cause.message,
          details: { cause },
        },
      };
    }
    return { type: 'found', value: structuredClone(link) };
  }

  async findRepoLink({
    cwd,
  }: {
    cwd: string;
  }): Promise<OptionalResult<RepoLinkInfo>> {
    const linkedRoot = this.#findAncestor(cwd, repo => repo !== 'git-only');
    const root = linkedRoot ?? this.#findAncestor(cwd, () => true);
    if (!root) {
      return { type: 'missing' };
    }
    const repo = this.#repos.get(root);
    return {
      type: 'found',
      value: {
        rootPath: root,
        repoConfigPath: join(root, '.vercel', 'repo.json'),
        repoConfig:
          repo === 'git-only' || repo === undefined
            ? undefined
            : structuredClone(repo),
      },
    };
  }

  #findAncestor(
    start: string,
    matches: (repo: RepoProjectsConfig | 'git-only') => boolean
  ): string | undefined {
    let current = resolve(start);
    for (;;) {
      const repo = this.#repos.get(current);
      if (repo && matches(repo)) {
        return current;
      }
      const parent = dirname(current);
      if (parent === current) {
        return undefined;
      }
      current = parent;
    }
  }
}
