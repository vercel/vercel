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

describe('agent-runs inspect', () => {
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

  it('prints help and returns 2 when runId is missing', async () => {
    useLinkedProject();
    client.setArgv('agent-runs', 'inspect');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain('inspect');
  });

  it('fetches the run by id and renders a detail view', async () => {
    useLinkedProject();
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query;
      res.json({
        run: {
          id: 'run_001',
          status: 'completed',
          model: 'anthropic/claude-opus-4.8',
          trigger: 'api',
          createdAt: 1_718_000_000_000,
          durationMs: 4500,
          usage: { inputTokens: 100, outputTokens: 200 },
          events: [{ timestamp: 1_718_000_000_000, type: 'run.started' }],
          subagents: [
            { name: 'researcher', status: 'completed', durationMs: 1200 },
          ],
        },
      });
    });

    client.setArgv('agent-runs', 'inspect', 'run_001');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery).toMatchObject({
      runId: 'run_001',
      teamSlug: 'team_dummy',
      project: 'prj_test',
    });
    expect(receivedQuery).not.toHaveProperty('trace');
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('run_001');
    expect(stdout).toContain('Completed');
    expect(stdout).toContain('run.started');
    expect(stdout).toContain('researcher');
    expect(client.stderr.getFullOutput()).toContain('for full run data.');
  });

  it('prints the raw response with --json', async () => {
    useLinkedProject();
    const payload = { run: { id: 'run_001', status: 'error' } };
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      res.json(payload);
    });

    client.setArgv('agent-runs', 'inspect', 'run_001', '--json');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual(payload);
  });

  it('tracks telemetry with a redacted run id', async () => {
    useLinkedProject();
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      res.json({ run: { id: 'run_001' } });
    });

    client.setArgv('agent-runs', 'inspect', 'run_001');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:inspect', value: 'inspect' },
      { key: 'argument:runId', value: '[REDACTED]' },
    ]);
  });
});
