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

describe('resolveScope', () => {
  it('returns the linked project ids when the project is linked', () => {
    const result = resolveScope({
      linkedProject: linked({ orgId: 'team_xyz', projectId: 'prj_xyz' }),
    });
    expect(result).toEqual({ teamId: 'team_xyz', projectId: 'prj_xyz' });
  });

  it('returns an actionable error when the project is not linked', () => {
    const result = resolveScope({
      linkedProject: {
        status: 'not_linked',
        org: null,
        project: null,
      },
    });
    expect('message' in result).toBe(true);
    if ('message' in result) {
      expect(result.message).toContain('vercel link');
    }
  });
});
