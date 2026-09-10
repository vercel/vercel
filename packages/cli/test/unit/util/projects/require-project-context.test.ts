import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { defaultProject } from '../../../mocks/project';
import { requireProjectContext } from '../../../../src/util/projects/require-project-context';
import * as agentOutput from '../../../../src/util/agent-output';
import * as projectContextModule from '../../../../src/util/projects/resolve-project-context';

vi.mock('../../../../src/util/projects/resolve-project-context', () => ({
  resolveProjectContext: vi.fn(),
}));

vi.mock('../../../../src/util/agent-output', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../../../src/util/agent-output')>();
  return {
    ...actual,
    outputAgentError: vi.fn(),
  };
});

const resolveProjectContext = vi.mocked(
  projectContextModule.resolveProjectContext
);
const outputAgentError = vi.mocked(agentOutput.outputAgentError);

describe('requireProjectContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns link errors unchanged', async () => {
    resolveProjectContext.mockResolvedValue({
      status: 'error',
      exitCode: 2,
    });

    await expect(requireProjectContext(client, 'routes')).resolves.toBe(2);
  });

  it('returns the linked project and updates the current team', async () => {
    const link = {
      status: 'linked' as const,
      org: { id: 'team_123', slug: 'acme', type: 'team' as const },
      project: { ...defaultProject, id: 'project_123', name: 'site' },
    };
    resolveProjectContext.mockResolvedValue(link);

    await expect(requireProjectContext(client, 'routes')).resolves.toBe(link);
    expect(resolveProjectContext).toHaveBeenCalledWith({
      client,
      projectNameOrId: undefined,
    });
    expect(client.config.currentTeam).toBe('team_123');
  });

  it('passes an explicit project to the shared resolver', async () => {
    const link = {
      status: 'linked' as const,
      org: { id: 'team_123', slug: 'acme', type: 'team' as const },
      project: { ...defaultProject, id: 'project_123', name: 'site' },
    };
    resolveProjectContext.mockResolvedValue(link);

    await expect(
      requireProjectContext(client, 'routes', 'payments-api')
    ).resolves.toBe(link);
    expect(resolveProjectContext).toHaveBeenCalledWith({
      client,
      projectNameOrId: 'payments-api',
    });
  });

  it('preserves the redirects non-interactive error payload', async () => {
    resolveProjectContext.mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    });
    client.nonInteractive = true;

    await expect(requireProjectContext(client, 'redirects')).resolves.toBe(1);
    expect(outputAgentError).toHaveBeenCalledWith(
      client,
      {
        status: 'error',
        reason: 'not_linked',
        message:
          "Your codebase isn't linked to a project on Vercel. Run vercel link to begin.",
        next: [{ command: 'vercel link' }],
      },
      1
    );
  });

  it.each([
    'routes',
    'firewall',
  ] as const)('preserves the %s non-interactive error payload and global flags', async command => {
    resolveProjectContext.mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    });
    client.nonInteractive = true;
    client.setArgv(command, 'list', '--cwd', '/tmp/site', '--non-interactive');

    await expect(requireProjectContext(client, command)).resolves.toBe(1);
    expect(outputAgentError).toHaveBeenCalledWith(
      client,
      {
        status: 'error',
        reason: 'not_linked',
        userActionRequired: true,
        message: `Your codebase is not linked to a Vercel project. Run link first, then retry ${command} commands.`,
        next: [
          {
            command: 'vercel link --cwd /tmp/site --non-interactive',
            when: 'to link this directory to a project',
          },
        ],
      },
      1
    );
  });
});
