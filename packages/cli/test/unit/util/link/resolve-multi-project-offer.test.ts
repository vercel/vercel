import { describe, expect, it } from 'vitest';
import { resolveMultiProjectOffer } from '../../../../src/util/link/setup-and-link';
import type { RepoRootSearchResult } from '../../../../src/util/projects/search-project-across-teams';
import type { Org } from '@vercel-internals/types';
import type { Project } from '@vercel-internals/types';

const org: Org = { type: 'team', id: 'team_123', slug: 'vercel' };

function project(id: string, rootDirectory?: string): Project {
  return { id, name: id, rootDirectory } as Project;
}

function search(
  overrides: Partial<RepoRootSearchResult> = {}
): RepoRootSearchResult {
  return {
    matches: [],
    connectedByOrgId: new Map(),
    rootPath: '/repo',
    remote: {
      rootPath: '/repo',
      remoteName: 'origin',
      repoUrl: 'git@github.com:vercel/front.git',
    },
    ...overrides,
  };
}

describe('resolveMultiProjectOffer()', () => {
  it('offers repo-wide linking when several projects are connected', () => {
    const offer = resolveMultiProjectOffer({
      path: '/repo',
      org,
      repoSearch: search({
        connectedByOrgId: new Map([
          [org.id, [project('a'), project('b'), project('c')]],
        ]),
      }),
    });

    expect(offer).toEqual({ connectedCount: 3 });
  });

  it('offers repo-wide linking even when the remote is unresolved', () => {
    // The offer describes the count only; naming the remote is the picker's
    // job, so an unresolved remote must not suppress the offer.
    const offer = resolveMultiProjectOffer({
      path: '/repo',
      org,
      repoSearch: search({
        remote: undefined,
        connectedByOrgId: new Map([[org.id, [project('a'), project('b')]]]),
      }),
    });

    expect(offer).toEqual({ connectedCount: 2 });
  });

  it('does not offer repo-wide linking for a single connected project', () => {
    // A lone project is already the preselected `(linked by git)` suggestion,
    // so a "Link all 1 projects" row would only duplicate it.
    const offer = resolveMultiProjectOffer({
      path: '/repo',
      org,
      repoSearch: search({
        connectedByOrgId: new Map([[org.id, [project('a')]]]),
      }),
    });

    expect(offer).toBeUndefined();
  });

  it('does not offer repo-wide linking when nothing is connected', () => {
    const offer = resolveMultiProjectOffer({
      path: '/repo',
      org,
      repoSearch: search({ connectedByOrgId: new Map([[org.id, []]]) }),
    });

    expect(offer).toBeUndefined();
  });

  it('counts only projects connected under the selected team', () => {
    const offer = resolveMultiProjectOffer({
      path: '/repo',
      org,
      repoSearch: search({
        connectedByOrgId: new Map([
          [org.id, [project('a')]],
          ['team_other', [project('b'), project('c'), project('d')]],
        ]),
      }),
    });

    expect(offer).toBeUndefined();
  });

  it('does not offer repo-wide linking from a subdirectory', () => {
    // Inside a single package, linking that one project is the right job.
    const offer = resolveMultiProjectOffer({
      path: '/repo/apps/web',
      org,
      repoSearch: search({
        connectedByOrgId: new Map([
          [org.id, [project('a'), project('b'), project('c')]],
        ]),
      }),
    });

    expect(offer).toBeUndefined();
  });

  it('does not offer repo-wide linking outside a Git repository', () => {
    const offer = resolveMultiProjectOffer({
      path: '/repo',
      org,
      repoSearch: search({
        rootPath: undefined,
        remote: undefined,
        connectedByOrgId: new Map([
          [org.id, [project('a'), project('b'), project('c')]],
        ]),
      }),
    });

    expect(offer).toBeUndefined();
  });
});
