import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectLinkResult } from '@vercel-internals/types';
import type Client from '../../../../src/util/client';
import { resolveScope } from '../../../../src/commands/traces/scope-resolver';
import { ProjectNotFound } from '../../../../src/util/errors-ts';
import getProjectByNameOrId from '../../../../src/util/projects/get-project-by-id-or-name';

vi.mock('../../../../src/util/projects/get-project-by-id-or-name');

const mockedGetProject = vi.mocked(getProjectByNameOrId);
const client = { config: { currentTeam: 'team_canonical' } } as Client;

function linked(
  overrides: Partial<{
    orgId: string;
    projectId: string;
    orgSlug: string;
    projectName: string;
  }> = {}
): ProjectLinkResult {
  return {
    status: 'linked',
    org: {
      id: overrides.orgId ?? 'team_abc',
      slug: overrides.orgSlug ?? 'my-team',
      type: 'team',
    },
    project: {
      id: overrides.projectId ?? 'prj_123',
      name: overrides.projectName ?? 'my-project',
      accountId: overrides.orgId ?? 'team_abc',
      updatedAt: 0,
      createdAt: 0,
    },
  };
}

const NOT_LINKED: ProjectLinkResult = {
  status: 'not_linked',
  org: null,
  project: null,
};

describe('resolveScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.config.currentTeam = 'team_canonical';
    mockedGetProject.mockResolvedValue({ id: 'prj_canonical' } as never);
  });

  it('returns linked project ids without flags', async () => {
    await expect(
      resolveScope({
        client,
        linkedProject: linked({ orgId: 'team_xyz', projectId: 'prj_xyz' }),
      })
    ).resolves.toEqual({ teamId: 'team_xyz', projectId: 'prj_xyz' });
    expect(mockedGetProject).not.toHaveBeenCalled();
  });

  it('uses the canonical selected team for a scope slug', async () => {
    await expect(
      resolveScope({
        client,
        flags: { scope: 'team-flag', project: 'project-flag' },
        linkedProject: NOT_LINKED,
      })
    ).resolves.toEqual({
      teamId: 'team_canonical',
      projectId: 'prj_canonical',
    });
    expect(mockedGetProject).toHaveBeenCalledWith(
      client,
      'project-flag',
      'team_canonical'
    );
  });

  it('resolves flagged values against the selected team', async () => {
    await expect(
      resolveScope({
        client,
        flags: { scope: 'other-team', project: 'other-project' },
        linkedProject: linked({ orgId: 'team_xyz', projectId: 'prj_xyz' }),
      })
    ).resolves.toEqual({
      teamId: 'team_canonical',
      projectId: 'prj_canonical',
    });
  });

  it('resolves a flagged project against the linked team', async () => {
    await expect(
      resolveScope({
        client,
        flags: { project: 'other-project' },
        linkedProject: linked({ orgId: 'team_xyz', projectId: 'prj_xyz' }),
      })
    ).resolves.toEqual({ teamId: 'team_xyz', projectId: 'prj_canonical' });
    expect(mockedGetProject).toHaveBeenCalledWith(
      client,
      'other-project',
      'team_xyz'
    );
  });

  it('revalidates a linked project when --scope changes', async () => {
    await expect(
      resolveScope({
        client,
        flags: { scope: 'other-team' },
        linkedProject: linked({ orgId: 'team_xyz', projectId: 'prj_xyz' }),
      })
    ).resolves.toEqual({
      teamId: 'team_canonical',
      projectId: 'prj_canonical',
    });
    expect(mockedGetProject).toHaveBeenCalledWith(
      client,
      'prj_xyz',
      'team_canonical'
    );
  });

  it('returns an actionable error without a link or both flags', async () => {
    const result = await resolveScope({ client, linkedProject: NOT_LINKED });
    expect('message' in result).toBe(true);
    if ('message' in result) {
      expect(result.reason).toBe('not_linked');
      expect(result.message).toContain('vercel link');
      expect(result.message).toContain('--scope');
      expect(result.message).toContain('--project');
    }
  });

  it('reports a missing project as not found', async () => {
    mockedGetProject.mockResolvedValue(new ProjectNotFound('missing-project'));

    const result = await resolveScope({
      client,
      flags: { scope: 'team-flag', project: 'missing-project' },
      linkedProject: NOT_LINKED,
    });

    expect(result).toEqual({
      reason: 'not_found',
      message: 'Project not found: missing-project',
    });
  });

  it('treats whitespace-only flags as missing', async () => {
    await expect(
      resolveScope({
        client,
        flags: { scope: '   ', project: '   ' },
        linkedProject: linked({ orgId: 'team_xyz', projectId: 'prj_xyz' }),
      })
    ).resolves.toEqual({ teamId: 'team_xyz', projectId: 'prj_xyz' });
  });
});
