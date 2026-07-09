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

const sampleRun = {
  id: 'run_001',
  status: 'completed',
  sessionStatus: 'waiting',
  model: 'anthropic/claude-opus-4.8',
  trigger: 'api',
  createdAt: Date.now() - 60_000,
  durationMs: 4500,
  usage: { inputTokens: 100, outputTokens: 200 },
};

describe('agent-runs list', () => {
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

  it('lists runs for the linked project with default query params', async () => {
    useLinkedProject();
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query;
      res.json({ runs: [sampleRun], pagination: { page: 1, total: 1 } });
    });

    client.setArgv('agent-runs', 'list');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery).toMatchObject({
      teamSlug: 'team_dummy',
      project: 'prj_test',
      environment: 'production',
    });
    expect(receivedQuery).not.toHaveProperty('view');
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('run_001');
    expect(stdout).toContain('Waiting');
    expect(stdout).toContain('anthropic/claude-opus-4.8');
    expect(client.stderr.getFullOutput()).toContain(
      'vercel agent-runs inspect <runId>'
    );
  });

  it('forwards search, issue, trigger, pagination, environment, and time range params', async () => {
    useLinkedProject();
    let receivedQuery: Record<string, string> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query as Record<string, string>;
      res.json({ runs: [] });
    });

    client.setArgv(
      'agent-runs',
      'list',
      '--search',
      'checkout',
      '--issue',
      'error',
      '--trigger',
      'slack',
      '--page',
      '2',
      '--limit',
      '50',
      '--environment',
      'preview',
      '--since',
      '1d'
    );
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery).toMatchObject({
      search: 'checkout',
      issue: 'error',
      trigger: 'slack',
      page: '2',
      pageSize: '50',
      environment: 'preview',
    });
    expect(receivedQuery).not.toHaveProperty('session_status');
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(Number(receivedQuery?.from)).toBeGreaterThan(0);
    expect(Number(receivedQuery?.to)).toBeGreaterThan(nowSeconds - 60);
    expect(client.stderr.getFullOutput()).toContain(
      'No Agent Runs match the current filters.'
    );
  });

  it('forwards issue fingerprint filters', async () => {
    useLinkedProject();
    let receivedQuery: Record<string, string> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query as Record<string, string>;
      res.json({ runs: [] });
    });

    client.setArgv(
      'agent-runs',
      'list',
      '--issue',
      'error',
      '--issue-code',
      'ETIMEDOUT',
      '--issue-type',
      'action_failed',
      '--issue-source',
      'remote_subagent',
      '--issue-tool',
      'deployment-reviewer'
    );
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery).toMatchObject({
      issue: 'error',
      issue_code: 'ETIMEDOUT',
      issue_type: 'action_failed',
      issue_source: 'remote_subagent',
      issue_tool: 'deployment-reviewer',
    });
  });

  it('treats issue fingerprint filters as error filters', async () => {
    useLinkedProject();
    let receivedQuery: Record<string, string> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query as Record<string, string>;
      res.json({ runs: [] });
    });

    client.setArgv('agent-runs', 'list', '--issue-source', 'remote_subagent');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery).toMatchObject({
      issue: 'error',
      issue_source: 'remote_subagent',
    });
  });

  it('prints the raw response with --json', async () => {
    useLinkedProject();
    const payload = { runs: [sampleRun], pagination: { page: 1, total: 1 } };
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      res.json(payload);
    });

    client.setArgv('agent-runs', 'list', '--json');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual(payload);
  });

  it('reads dashboard pageInfo pagination', async () => {
    useLinkedProject();
    client.scenario.get('/api/observability/agent-runs', (_req, res) => {
      res.json({
        runs: [sampleRun],
        pageInfo: { page: 1, pageSize: 1, total: 3 },
      });
    });

    client.setArgv('agent-runs', 'list');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'Showing 1 of 3 Agent Runs'
    );
  });

  it('uses --scope and --project without a linked project', async () => {
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query;
      res.json({ runs: [] });
    });

    client.setArgv(
      'agent-runs',
      'list',
      '--scope',
      'my-team',
      '--project',
      'my-app'
    );
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
    expect(receivedQuery).toMatchObject({
      teamSlug: 'my-team',
      project: 'my-app',
    });
  });

  it('errors when --scope points at a different team than the linked project', async () => {
    useLinkedProject();
    client.setArgv('agent-runs', 'list', '--scope', 'other-team');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      "doesn't match the linked project's team"
    );
  });

  it('uses the linked project when --scope matches the linked team', async () => {
    useLinkedProject();
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query;
      res.json({ runs: [] });
    });

    client.setArgv('agent-runs', 'list', '--scope', 'my-team');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery).toMatchObject({
      teamSlug: 'my-team',
      project: 'prj_test',
    });
  });

  it('errors when --until is used without --since', async () => {
    useLinkedProject();
    client.setArgv('agent-runs', 'list', '--until', '1h');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '`--until` requires `--since`.'
    );
  });

  it('errors when --issue is not supported', async () => {
    useLinkedProject();
    client.setArgv('agent-runs', 'list', '--issue', 'policy_blocked');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '`--issue` currently supports only `error`.'
    );
  });

  it('errors when --issue-type is not supported', async () => {
    useLinkedProject();
    client.setArgv('agent-runs', 'list', '--issue-type', 'cancelled');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '`--issue-type` supports `action_failed`, `action_rejected`, `step_failed`, `turn_failed`, `session_failed`, or `policy_blocked`.'
    );
  });

  it('errors when --issue-source is not supported', async () => {
    useLinkedProject();
    client.setArgv('agent-runs', 'list', '--issue-source', 'browser');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '`--issue-source` supports `remote_subagent`, `skill`, `subagent`, `tool`, or `workflow`.'
    );
  });

  it('errors when --trigger is not supported', async () => {
    useLinkedProject();
    client.setArgv('agent-runs', 'list', '--trigger', 'github');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '`--trigger` supports `slack`, `http`, `schedule`, `manual`, or `unknown`.'
    );
  });

  it('emits a JSON error payload in non-interactive mode for invalid arguments', async () => {
    useLinkedProject();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    client.nonInteractive = true;
    client.setArgv('agent-runs', 'list', '--until', '1h');

    await expect(agentRuns(client)).rejects.toThrow('process.exit called');
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('returns 1 and prints the API error on failure', async () => {
    useLinkedProject();
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      res.status(403).json({ error: { message: 'Not authorized' } });
    });

    client.setArgv('agent-runs', 'list');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Not authorized');
  });

  it('errors when there is no linked project and no flags', async () => {
    mockedGetLinkedProject.mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    } as Awaited<ReturnType<typeof linkModule.getLinkedProject>>);

    client.setArgv('agent-runs', 'list');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No linked project found.');
  });

  it('tracks telemetry for subcommand and flags', async () => {
    useLinkedProject();
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      res.json({ runs: [] });
    });

    client.setArgv(
      'agent-runs',
      'list',
      '--json',
      '--search',
      'checkout',
      '--issue',
      'error',
      '--trigger',
      'manual',
      '--issue-code',
      'ETIMEDOUT',
      '--issue-type',
      'action_failed',
      '--issue-source',
      'tool',
      '--issue-tool',
      'linear.createIssue'
    );
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:list', value: 'list' },
      { key: 'option:search', value: '[REDACTED]' },
      { key: 'option:issue', value: 'error' },
      { key: 'option:issue-code', value: '[REDACTED]' },
      { key: 'option:issue-type', value: 'action_failed' },
      { key: 'option:issue-source', value: 'tool' },
      { key: 'option:issue-tool', value: '[REDACTED]' },
      { key: 'option:trigger', value: 'manual' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });
});

describe('agent-runs (routing)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
  });

  it('errors on unknown subcommands', async () => {
    client.setArgv('agent-runs', 'bogus');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Unknown subcommand: bogus'
    );
  });

  it('prints subcommand help for `agent runs --help`', async () => {
    client.setArgv('agent-runs', 'list', '--help');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(2);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'agent-runs:list' },
    ]);
  });
});
