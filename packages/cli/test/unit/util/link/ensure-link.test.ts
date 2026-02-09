import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ensureLink } from '../../../../src/util/link/ensure-link';
import { client } from '../../../mocks/client';
import { isActionRequiredPayload } from '../../../../src/util/agent-output';
import type * as AgentOutputModule from '../../../../src/util/agent-output';

vi.mock('../../../../src/util/projects/link', () => ({
  getLinkedProject: vi.fn(),
}));

vi.mock('../../../../src/util/link/setup-and-link', () => ({
  default: vi.fn(),
}));

vi.mock('../../../../src/util/agent-output', async importOriginal => {
  const actual = await (
    importOriginal as () => Promise<typeof AgentOutputModule>
  )();
  return {
    ...actual,
    outputActionRequired: vi.fn(),
  };
});

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

  it('passes client.nonInteractive to setupAndLink when opts.nonInteractive is not set', async () => {
    vi.mocked(getLinkedProject).mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    });
    const setupAndLinkModule = await import(
      '../../../../src/util/link/setup-and-link'
    );
    const setupAndLinkFn = setupAndLinkModule.default as ReturnType<
      typeof vi.fn
    >;
    vi.mocked(setupAndLinkFn).mockResolvedValue({
      status: 'linked',
      org: { id: 'o1', slug: 'team', type: 'team' as const },
      project: { id: 'p1', name: 'proj' },
    });

    (client as { nonInteractive: boolean }).nonInteractive = true;
    await ensureLink('deploy', client, '/cwd', {});
    (client as { nonInteractive: boolean }).nonInteractive = false;

    expect(setupAndLinkFn).toHaveBeenCalledWith(
      client,
      '/cwd',
      expect.objectContaining({
        link: { status: 'not_linked', org: null, project: null },
        nonInteractive: true,
      })
    );
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
      nonInteractive: false,
      projectName: 'my-app',
    });
  });

  describe('exit behavior', () => {
    let exitSpy: { mockRestore: () => void };

    beforeEach(() => {
      exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as () => never) as unknown as {
        mockRestore: () => void;
      };
    });

    it('calls process.exit with code when link is error and client.nonInteractive', async () => {
      vi.mocked(getLinkedProject).mockResolvedValue({
        status: 'error',
        exitCode: 1,
        reason: 'HEADLESS',
      });
      const setupAndLinkModule = await import(
        '../../../../src/util/link/setup-and-link'
      );
      const setupAndLink = setupAndLinkModule.default as ReturnType<
        typeof vi.fn
      >;
      vi.mocked(setupAndLink).mockClear();

      (client as { nonInteractive: boolean }).nonInteractive = true;
      await ensureLink('deploy', client, client.cwd, {});
      (client as { nonInteractive: boolean }).nonInteractive = false;

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('returns 0 when user aborts (setupAndLink returns not_linked)', async () => {
      vi.mocked(getLinkedProject).mockResolvedValue({
        status: 'not_linked',
        org: null,
        project: null,
      });
      const setupAndLinkModule = await import(
        '../../../../src/util/link/setup-and-link'
      );
      const setupAndLink = setupAndLinkModule.default as ReturnType<
        typeof vi.fn
      >;
      vi.mocked(setupAndLink).mockResolvedValue({
        status: 'not_linked',
      });

      const result = await ensureLink('deploy', client, client.cwd, {});

      expect(exitSpy).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it('returns ProjectLinked when linked', async () => {
      const linked = {
        status: 'linked' as const,
        org: { id: 'o1', slug: 'team', type: 'team' as const },
        project: { id: 'p1', name: 'proj' },
      };
      vi.mocked(getLinkedProject).mockResolvedValue(linked);

      const result = await ensureLink('deploy', client, client.cwd, {});

      expect(exitSpy).not.toHaveBeenCalled();
      expect(result).toEqual(linked);
    });
  });
});
