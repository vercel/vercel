import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import agentRuns from '../../../../src/commands/agent-runs';
import * as linkModule from '../../../../src/util/projects/link';

vi.mock('../../../../src/util/projects/link', async () => {
  const actual = await vi.importActual('../../../../src/util/projects/link');
  return {
    ...(actual as object),
    getLinkedProject: vi.fn(),
  };
});

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

describe('agent-runs projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    process.env.VERCEL_AGENT_RUNS_API_URL = new URL(
      '/api/observability/agent-runs',
      client.apiUrl
    ).href;
  });

  afterEach(() => {
    delete process.env.VERCEL_AGENT_RUNS_API_URL;
  });

  it('lists team projects with Agent Runs activity', async () => {
    mockedGetLinkedProject.mockResolvedValue({
      status: 'linked',
      project: {
        id: 'prj_test',
        name: 'agent-project',
        accountId: 'team_dummy',
        updatedAt: Date.now(),
        createdAt: Date.now(),
      },
      org: { id: 'team_dummy', slug: 'my-team', type: 'team' },
    } as Awaited<ReturnType<typeof linkModule.getLinkedProject>>);

    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query;
      res.json({
        projects: [{ projectName: 'my-app', runs: 5, avgDurationMs: 1234 }],
      });
    });

    client.setArgv('agent-runs', 'projects');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery).toMatchObject({
      teamSlug: 'team_dummy',
      view: 'team',
      environment: 'production',
    });
    expect(receivedQuery).not.toHaveProperty('project');
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('my-app');
    expect(stdout).toContain('5');
  });

  it('works with --scope and no linked project', async () => {
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query;
      res.json({ projects: [] });
    });

    client.setArgv('agent-runs', 'projects', '--scope', 'my-team');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
    expect(receivedQuery).toMatchObject({ teamSlug: 'my-team', view: 'team' });
    expect(client.stderr.getFullOutput()).toContain(
      'No projects with Agent Runs activity found.'
    );
  });

  it('errors when no team scope can be resolved', async () => {
    mockedGetLinkedProject.mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    } as Awaited<ReturnType<typeof linkModule.getLinkedProject>>);

    client.setArgv('agent-runs', 'projects');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No team scope found.');
  });
});
