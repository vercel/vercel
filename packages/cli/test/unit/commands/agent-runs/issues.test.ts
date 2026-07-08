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

function useLinkedProject() {
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
}

describe('agent-runs issues', () => {
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

  it('lists issue groups for the linked project', async () => {
    useLinkedProject();
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query;
      res.json({
        issueGroups: [
          {
            type: 'action_failed',
            code: 'ETIMEDOUT',
            tool: 'linear.createIssue',
            turns: 5,
            runs: 2,
            lastSeenAt: new Date(Date.now() - 60_000).toISOString(),
            sampleRunId: 'run_001',
          },
        ],
      });
    });

    client.setArgv('agent-runs', 'issues');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery).toMatchObject({
      teamSlug: 'team_dummy',
      project: 'prj_test',
      environment: 'production',
      groupBy: 'issue',
    });
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('Action failed');
    expect(stdout).toContain('linear.createIssue');
    expect(stdout).toContain('ETIMEDOUT');
    expect(stdout).toContain('run_001');
  });

  it('prints raw JSON', async () => {
    useLinkedProject();
    client.scenario.get('/api/observability/agent-runs', (_req, res) => {
      res.json({ issueGroups: [] });
    });

    client.setArgv('agent-runs', 'issues', '--json');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      issueGroups: [],
    });
  });

  it('tracks telemetry for subcommand and flags', async () => {
    useLinkedProject();
    client.scenario.get('/api/observability/agent-runs', (_req, res) => {
      res.json({ issueGroups: [] });
    });

    client.setArgv('agent-runs', 'issues', '--json');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:issues', value: 'issues' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });
});
