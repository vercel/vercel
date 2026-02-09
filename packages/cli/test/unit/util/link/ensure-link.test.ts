import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ensureLink } from '../../../../src/util/link/ensure-link';
import { client } from '../../../mocks/client';
import { isActionRequiredPayload } from '../../../../src/util/agent-output';

vi.mock('../../../../src/util/projects/link', () => ({
  getLinkedProject: vi.fn(),
}));

vi.mock('../../../../src/util/link/setup-and-link', () => ({
  default: vi.fn(),
}));

describe('ensureLink', () => {
  let getLinkedProject: ReturnType<typeof vi.fn>;
  let setupAndLink: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const linkModule = await import('../../../../src/util/projects/link');
    const setupAndLinkModule = await import(
      '../../../../src/util/link/setup-and-link'
    );
    getLinkedProject = linkModule.getLinkedProject as ReturnType<typeof vi.fn>;
    setupAndLink = setupAndLinkModule.default as ReturnType<typeof vi.fn>;
  });

  it('returns action_required payload when not linked and setupAndLink returns action_required', async () => {
    const actionRequiredPayload = {
      status: 'action_required' as const,
      reason: 'missing_scope',
      message: 'Multiple teams available. Provide --team or --scope.',
      choices: [{ id: 'team-1', name: 'team-one' }],
      next: [{ command: 'vercel link --scope team-one' }],
    };

    vi.mocked(getLinkedProject).mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    });
    vi.mocked(setupAndLink).mockResolvedValue(actionRequiredPayload);

    const result = await ensureLink('pull', client, client.cwd, {});

    expect(isActionRequiredPayload(result)).toBe(true);
    if (!isActionRequiredPayload(result)) return;
    expect(result.status).toBe('action_required');
    expect(result.reason).toBe('missing_scope');
    expect(result.message).toContain('Multiple teams');
    expect(result.choices).toEqual(actionRequiredPayload.choices);
    expect(result.next).toEqual(actionRequiredPayload.next);
  });

  it('calls setupAndLink when link is not_linked', async () => {
    vi.mocked(getLinkedProject).mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    });
    vi.mocked(setupAndLink).mockResolvedValue({
      status: 'linked',
      org: { id: 'org-1', slug: 'org-1', type: 'team' as const },
      project: { id: 'proj-1', name: 'my-project' },
    });

    await ensureLink('deploy', client, '/some/cwd', { projectName: 'my-app' });

    expect(setupAndLink).toHaveBeenCalledWith(client, '/some/cwd', {
      link: { status: 'not_linked', org: null, project: null },
      projectName: 'my-app',
    });
  });
});
