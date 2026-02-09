import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ensureLink } from '../../../../src/util/link/ensure-link';
import { client } from '../../../mocks/client';
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

  it('calls outputActionRequired and process.exit(1) when not linked and setupAndLink returns action_required', async () => {
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

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as () => never) as unknown as {
      mockRestore: () => void;
    };
    const agentOutput = await import('../../../../src/util/agent-output');
    const outputActionRequired = vi.mocked(agentOutput.outputActionRequired);

    await ensureLink('pull', client, client.cwd, {});

    expect(outputActionRequired).toHaveBeenCalledWith(
      client,
      actionRequiredPayload
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
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

  describe('exit behavior', () => {
    let exitSpy: { mockRestore: () => void };

    beforeEach(() => {
      exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as () => never) as unknown as {
        mockRestore: () => void;
      };
    });

    it('calls process.exit with code when link is error', async () => {
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

      await ensureLink('deploy', client, client.cwd, {});

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('calls process.exit(0) when user aborts (setupAndLink returns not_linked)', async () => {
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

      await ensureLink('deploy', client, client.cwd, {});

      expect(exitSpy).toHaveBeenCalledWith(0);
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
