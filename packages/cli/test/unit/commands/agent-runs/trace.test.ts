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

// Real API shape: turns nest under a key named after the framework.
const sampleTrace = {
  trace: {
    runId: 'run_001',
    framework: 'eve',
    eve: {
      turns: [
        {
          messages: [{ role: 'user', content: 'find flaky tests' }],
          toolCalls: [{ name: 'search', input: '{"q":"flaky"}', output: 'ok' }],
        },
      ],
    },
  },
};

describe('agent-runs trace', () => {
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
    client.setArgv('agent-runs', 'trace');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(2);
  });

  it('fetches the trace and renders turns', async () => {
    useLinkedProject();
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query;
      res.json(sampleTrace);
    });

    client.setArgv('agent-runs', 'trace', 'run_001');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery).toMatchObject({
      runId: 'run_001',
      trace: '1',
      teamSlug: 'team_dummy',
      project: 'prj_test',
    });
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('# Agent Run run_001');
    expect(stdout).toContain('## Turn 1');
    expect(stdout).toContain('find flaky tests');
    expect(stdout).toContain('`search`');
  });

  it('truncates long string fields by default and honors --max-field-length', async () => {
    useLinkedProject();
    const longOutput = 'x'.repeat(9000);
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      res.json({
        trace: {
          turns: [{ toolCalls: [{ name: 'search', output: longOutput }] }],
        },
      });
    });

    client.setArgv('agent-runs', 'trace', 'run_001', '--json');
    let exitCode = await agentRuns(client);
    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toContain('[truncated 1000 chars]');

    client.reset();
    process.env.VERCEL_AGENT_RUNS_API_URL = new URL(
      '/api/observability/agent-runs',
      client.apiUrl
    ).href;
    useLinkedProject();
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      res.json({
        trace: {
          turns: [{ toolCalls: [{ name: 'search', output: longOutput }] }],
        },
      });
    });
    client.setArgv(
      'agent-runs',
      'trace',
      'run_001',
      '--json',
      '--max-field-length',
      '0'
    );
    exitCode = await agentRuns(client);
    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).not.toContain('[truncated');
  });

  it('falls back to JSON output for unrecognized trace shapes', async () => {
    useLinkedProject();
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      res.json({ trace: { something: 'else' } });
    });

    client.setArgv('agent-runs', 'trace', 'run_001');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      trace: { something: 'else' },
    });
  });
});
