import { describe, expect, it } from 'vitest';
import type { ProjectLinkResult } from '@vercel-internals/types';
import { resolveScope } from '../../../../src/commands/traces/scope-resolver';

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
  it('returns the linked project ids when linked and no flags', () => {
    const result = resolveScope({
      linkedProject: linked({ orgId: 'team_xyz', projectId: 'prj_xyz' }),
    });
    expect(result).toEqual({ teamId: 'team_xyz', projectId: 'prj_xyz' });
  });

  it('uses flags when both --scope and --project are provided without a link', () => {
    const result = resolveScope({
      flags: { scope: 'team_flag', project: 'prj_flag' },
      linkedProject: NOT_LINKED,
    });
    expect(result).toEqual({ teamId: 'team_flag', projectId: 'prj_flag' });
  });

  it('lets flags override individual fields of the linked project', () => {
    const result = resolveScope({
      flags: { scope: 'other-team', project: 'other-project' },
      linkedProject: linked({ orgId: 'team_xyz', projectId: 'prj_xyz' }),
    });
    expect(result).toEqual({
      teamId: 'other-team',
      projectId: 'other-project',
    });
  });

  it('falls back to the linked team when only --project is provided', () => {
    const result = resolveScope({
      flags: { project: 'other-project' },
      linkedProject: linked({ orgId: 'team_xyz', projectId: 'prj_xyz' }),
    });
    expect(result).toEqual({
      teamId: 'team_xyz',
      projectId: 'other-project',
    });
  });

  it('falls back to the linked project when only --scope is provided', () => {
    const result = resolveScope({
      flags: { scope: 'other-team' },
      linkedProject: linked({ orgId: 'team_xyz', projectId: 'prj_xyz' }),
    });
    expect(result).toEqual({
      teamId: 'other-team',
      projectId: 'prj_xyz',
    });
  });

  it('returns an actionable error when neither linked nor full flags are present', () => {
    const result = resolveScope({
      linkedProject: NOT_LINKED,
    });
    expect('message' in result).toBe(true);
    if ('message' in result) {
      expect(result.message).toContain('vercel link');
      expect(result.message).toContain('--scope');
      expect(result.message).toContain('--project');
    }
  });

  it('returns the same error when partial flags are provided without a link', () => {
    const onlyScope = resolveScope({
      flags: { scope: 'team_flag' },
      linkedProject: NOT_LINKED,
    });
    expect('message' in onlyScope).toBe(true);

    const onlyProject = resolveScope({
      flags: { project: 'prj_flag' },
      linkedProject: NOT_LINKED,
    });
    expect('message' in onlyProject).toBe(true);
  });

  it('treats whitespace-only flag values as missing', () => {
    const result = resolveScope({
      flags: { scope: '   ', project: '   ' },
      linkedProject: linked({ orgId: 'team_xyz', projectId: 'prj_xyz' }),
    });
    expect(result).toEqual({ teamId: 'team_xyz', projectId: 'prj_xyz' });
  });
});
