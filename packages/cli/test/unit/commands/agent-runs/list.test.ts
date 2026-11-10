import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import agentRuns from '../../../../src/commands/agent-runs';
import * as linkModule from '../../../../src/util/projects/link';
import { expectDeprecationInJson } from '../../../helpers/deprecation-warning';

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
    expect(stdout).toContain('Completed');
    expect(stdout).toContain('anthropic/claude-opus-4.8');
    expect(client.stderr.getFullOutput()).toContain(
      'vercel agent-runs inspect <runId>'
    );
  });

  it('forwards search, pagination, environment, and time range params', async () => {
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
      '--next',
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
      page: '2',
      pageSize: '50',
      environment: 'preview',
    });
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(Number(receivedQuery?.from)).toBeGreaterThan(0);
    expect(Number(receivedQuery?.to)).toBeGreaterThan(nowSeconds - 60);
    expect(client.stderr.getFullOutput()).toContain(
      'No Agent Runs match the current filters.'
    );
  });

  it('continues accepting --page', async () => {
    useLinkedProject();
    let receivedQuery: Record<string, string> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query as Record<string, string>;
      res.json({ runs: [] });
    });

    client.setArgv('agent-runs', 'list', '--page', '2');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery?.page).toBe('2');
    expect(client.stderr.getFullOutput()).toContain(
      '! --page is deprecated. Use --next.'
    );
  });

  it('rejects a --next that is not a cursor before any request', async () => {
    useLinkedProject();
    let requested = false;
    client.scenario.get('/api/observability/agent-runs', (_req, res) => {
      requested = true;
      res.json({ runs: [] });
    });

    client.setArgv('agent-runs', 'list', '--next', 'oops');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(2);
    expect(requested).toBe(false);
    expect(client.stderr.getFullOutput()).toContain(
      'Invalid or expired `--next` cursor.'
    );
  });

  it('still reads the hidden -N as --next', async () => {
    useLinkedProject();
    let receivedQuery: Record<string, string> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query as Record<string, string>;
      res.json({ runs: [] });
    });

    client.setArgv('agent-runs', 'list', '-N', '3');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery?.page).toBe('3');
    expect(client.stderr.getFullOutput()).toContain(
      '! -N is deprecated. Use --next.'
    );
  });

  it('prints a next page command that requests the next page, even after --', async () => {
    const pages: unknown[] = [];
    const windows: unknown[] = [];
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      pages.push(req.query.page);
      windows.push({ from: req.query.from, to: req.query.to });
      res.json({
        runs: [sampleRun],
        pagination: { page: Number(req.query.page ?? 1), total: 9 },
      });
    });

    client.setArgv(
      'agent-runs',
      'list',
      '--scope',
      'acme',
      '--project',
      'web',
      '--'
    );
    expect(await agentRuns(client)).toBe(0);
    const command = client.stderr
      .getFullOutput()
      .match(/ {2}Next page:\n {4}(.+)\n/)?.[1];
    expect(command).toMatch(
      /^vercel agent-runs list --scope acme --project web --since \S+ --until \S+ --next=2 --$/
    );

    // Run the printed command and check which page it asks for.
    client.setArgv(...command!.split(' ').slice(1));
    expect(await agentRuns(client)).toBe(0);
    expect(pages).toEqual([undefined, '2']);
    expect(windows[1]).toEqual(windows[0]);
  });

  it('keeps every filter and --limit in the next page command', async () => {
    useLinkedProject();
    let receivedQuery: Record<string, string> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query as Record<string, string>;
      res.json({ runs: [sampleRun], pagination: { page: 2, total: 9 } });
    });

    client.setArgv(
      'agent-runs',
      'list',
      '--search',
      'checkout',
      '--environment',
      'preview',
      '--since',
      '1d',
      '--limit',
      '1',
      '--page',
      '2'
    );
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    const sinceIso = new Date(Number(receivedQuery?.from) * 1000).toISOString();
    const untilIso = new Date(Number(receivedQuery?.to) * 1000).toISOString();
    expect(stderr).toContain('Showing 1 of 9 Agent Runs.');
    expect(stderr).toContain(
      `  Next page:\n    vercel agent-runs list --query checkout --environment preview --limit 1 --since ${sinceIso} --until ${untilIso} --next=3\n`
    );
    expect(stderr).not.toContain('for more.');
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
    expect(exitCode).toBe(2);
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
    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--until` requires `--since`.'
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
    expect(exitSpy).toHaveBeenCalledWith(2);
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
      '--next',
      '2'
    );
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:list', value: 'list' },
      { key: 'option:search', value: '[REDACTED]' },
      { key: 'option:next', value: '2' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });
});

describe('agent-runs list --query', () => {
  beforeEach(() => {
    process.env.VERCEL_AGENT_RUNS_API_URL = new URL(
      '/api/observability/agent-runs',
      client.apiUrl
    ).href;
  });

  afterEach(() => {
    delete process.env.VERCEL_AGENT_RUNS_API_URL;
  });

  // Runs `agent-runs list` with a fresh client, recording the list request.
  async function run(...args: string[]) {
    client.reset();
    useLinkedProject();
    let query: Record<string, unknown> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      query = req.query;
      res.json({ runs: [sampleRun], pagination: { page: 1, total: 1 } });
    });
    client.setArgv('agent-runs', 'list', '--since', '1d', ...args);
    const exitCode = await agentRuns(client);
    return {
      exitCode,
      // The time range is relative to now, so it can move between runs.
      query: query && { ...query, from: undefined, to: undefined },
      stdout: client.stdout.getFullOutput(),
      stderr: client.stderr.getFullOutput(),
    };
  }

  it('still accepts --search, with one warning that names --query', async () => {
    const now = await run('--query', 'checkout');
    const before = await run('--search', 'checkout');

    expect(now.exitCode).toBe(0);
    expect(now.query).toMatchObject({ search: 'checkout' });
    expect(now.stderr).not.toContain('deprecated');
    expect(before.exitCode).toBe(now.exitCode);
    expect(before.query).toEqual(now.query);
    expect(before.stdout).toBe(now.stdout);
    expect(before.stderr.match(/deprecated/g)).toHaveLength(1);
    expect(before.stderr).toContain('! --search is deprecated. Use --query.\n');
  });

  it('puts the warning in the JSON result with --json', async () => {
    const now = await run('--query', 'checkout', '--json');
    const before = await run('--search', 'checkout', '--json');

    expect(before.exitCode).toBe(0);
    expectDeprecationInJson(
      before.stdout,
      now.stdout,
      '--search is deprecated. Use --query.'
    );
    expect(before.stderr).not.toContain('deprecated');
  });

  it('tracks --query under its own telemetry key', async () => {
    await run('--query', 'checkout', '--json');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:list', value: 'list' },
      { key: 'option:since', value: '[REDACTED]' },
      { key: 'option:query', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('rejects --query with --search before any request', async () => {
    const result = await run('--query', 'a', '--search', 'b');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Can't use --query with --search.");
    expect(result.query).toBeUndefined();
  });
});

describe('agent-runs list continuation', () => {
  // Synthetic hybrid-list fixtures. `pageInfo.nextOffsets` mirrors the shape
  // the Agent Runs list endpoint returns when it merges Workflow and OTEL runs.
  const since = '2026-01-01T00:00:00Z';
  const until = '2026-01-02T00:00:00Z';
  const fromSeconds = '1767225600';
  const toSeconds = '1767312000';
  const otelCursor = 'b3RlbC1jdXJzb3ItMQ';
  const nextOffsets = {
    workflow: 2,
    otel: 0,
    otelCursor,
    otelRange: { from: 1767225600000, to: 1767312000000 },
  };
  // `<otel>.<workflow>.<otelRange.from>.<otelRange.to>.<otelCursor>` in base36.
  const expectedSourceCursor = `0.2.mjuohs00.mjw3xmo0.${otelCursor}`;
  const firstPage = [
    { ...sampleRun, id: 'run_page1_a' },
    { ...sampleRun, id: 'run_page1_b' },
  ];
  const secondPage = [
    { ...sampleRun, id: 'run_page2_a' },
    { ...sampleRun, id: 'run_page2_b' },
  ];

  let requests: Record<string, string>[];

  function useHybridList() {
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      const query = req.query as Record<string, string>;
      requests.push(query);
      if (query.cursor === expectedSourceCursor) {
        res.json({
          runs: secondPage,
          pageInfo: {
            total: 4,
            page: Number(query.page),
            pageSize: 2,
            hasMore: false,
          },
          meta: { dataSource: 'agent-hybrid', dataConfidence: 'real' },
        });
        return;
      }
      // Like the hybrid endpoint, ignore `page` without a cursor.
      res.json({
        runs: firstPage,
        pageInfo: {
          total: 4,
          page: Number(query.page ?? 1),
          pageSize: 2,
          hasMore: true,
          nextOffsets,
        },
        meta: { dataSource: 'agent-hybrid', dataConfidence: 'real' },
      });
    });
  }

  function runIds(stdout: string): string[] {
    return JSON.parse(stdout).runs.map((run: { id: string }) => run.id);
  }

  async function fetchFirstPageToken(...extraArgs: string[]) {
    client.setArgv(
      'agent-runs',
      'list',
      '--since',
      since,
      '--until',
      until,
      '--limit',
      '2',
      ...extraArgs,
      '--json'
    );
    expect(await agentRuns(client)).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(typeof payload.pagination?.next).toBe('string');
    return payload.pagination.next as string;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    requests = [];
    process.env.VERCEL_AGENT_RUNS_API_URL = new URL(
      '/api/observability/agent-runs',
      client.apiUrl
    ).href;
    useLinkedProject();
    useHybridList();
  });

  afterEach(() => {
    delete process.env.VERCEL_AGENT_RUNS_API_URL;
  });

  it('continues a hybrid list with the returned source offsets instead of repeating page 1', async () => {
    const next = await fetchFirstPageToken();
    const firstOutputLength = client.stdout.getFullOutput().length;

    client.setArgv(
      'agent-runs',
      'list',
      '--limit',
      '2',
      '--next',
      next,
      '--json'
    );
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(requests).toHaveLength(2);
    expect(requests[0]).not.toHaveProperty('cursor');
    expect(requests[1]).toMatchObject({
      cursor: expectedSourceCursor,
      page: '2',
      pageSize: '2',
      from: fromSeconds,
      to: toSeconds,
    });
    const secondOutput = client.stdout.getFullOutput().slice(firstOutputLength);
    expect(runIds(secondOutput)).toEqual(['run_page2_a', 'run_page2_b']);
    expect(JSON.parse(secondOutput).pagination).toEqual({ next: null });
  });

  it('keeps the first page time range when --since is relative', async () => {
    client.setArgv('agent-runs', 'list', '--since', '1d', '--json');
    expect(await agentRuns(client)).toBe(0);
    const next = JSON.parse(client.stdout.getFullOutput()).pagination.next;

    client.setArgv('agent-runs', 'list', '--next', next, '--json');
    expect(await agentRuns(client)).toBe(0);

    expect(requests[1].from).toBe(requests[0].from);
    expect(requests[1].to).toBe(requests[0].to);
  });

  it('sends the default 12h range and keeps it when the first page has no --since', async () => {
    client.setArgv('agent-runs', 'list', '--json');
    expect(await agentRuns(client)).toBe(0);
    const next = JSON.parse(client.stdout.getFullOutput()).pagination.next;

    client.setArgv('agent-runs', 'list', '--next', next, '--json');
    expect(await agentRuns(client)).toBe(0);

    const from = Number(requests[0].from);
    const to = Number(requests[0].to);
    expect(to - from).toBe(12 * 60 * 60);
    expect(Math.abs(to - Date.now() / 1000)).toBeLessThan(60);
    expect(requests[1]).toMatchObject({
      cursor: expectedSourceCursor,
      from: requests[0].from,
      to: requests[0].to,
    });
  });

  it('prints a next-page command that carries the cursor', async () => {
    client.setArgv(
      'agent-runs',
      'list',
      '--since',
      since,
      '--until',
      until,
      '--search',
      'checkout'
    );
    expect(await agentRuns(client)).toBe(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Next page:');
    const match = stderr.match(
      /vercel agent-runs list --query checkout --next=([A-Za-z0-9_-]+)/
    );
    expect(match).not.toBeNull();
    expect(stderr).not.toContain('--next=2');
    expect(stderr).not.toContain('--since');

    client.setArgv(
      'agent-runs',
      'list',
      '--search',
      'checkout',
      '--next',
      match![1],
      '--json'
    );
    expect(await agentRuns(client)).toBe(0);
    expect(requests[1]).toMatchObject({
      cursor: expectedSourceCursor,
      search: 'checkout',
      from: fromSeconds,
      to: toSeconds,
    });
  });

  it('prints the next-page command for an empty merged page with a cursor', async () => {
    client.reset();
    useLinkedProject();
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      requests.push(req.query as Record<string, string>);
      res.json({
        runs: [],
        pageInfo: {
          total: 4,
          page: 1,
          pageSize: 2,
          hasMore: true,
          nextOffsets,
        },
      });
    });

    client.setArgv('agent-runs', 'list', '--since', since, '--until', until);
    expect(await agentRuns(client)).toBe(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('No Agent Runs on this page.');
    expect(stderr).not.toContain('No Agent Runs match the current filters.');
    expect(stderr.match(/Next page:/g)).toHaveLength(1);
    expect(stderr).toMatch(/vercel agent-runs list --next=[A-Za-z0-9_-]+/);
  });

  it('rejects a page number for a hybrid list instead of repeating page 1', async () => {
    client.setArgv(
      'agent-runs',
      'list',
      '--limit',
      '2',
      '--next',
      '2',
      '--json'
    );
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(2);
    expect(requests[0]).toMatchObject({ page: '2' });
    expect(client.stdout.getFullOutput()).not.toContain('run_page1_a');
    expect(client.stderr.getFullOutput()).toContain(
      'Page numbers cannot continue this Agent Runs list.'
    );
  });

  it('keeps page numbers for Workflow-only lists with the same filters and range', async () => {
    // Replace the hybrid scenario with a Workflow-only response.
    client.reset();
    useLinkedProject();
    let receivedQuery: Record<string, string> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query as Record<string, string>;
      res.json({
        runs: firstPage,
        pageInfo: { total: 5, page: Number(req.query.page), pageSize: 2 },
      });
    });

    client.setArgv(
      '--cwd',
      'project dir',
      '--token',
      'synthetic-secret-token',
      '--scope',
      'my-team',
      'agent-runs',
      'list',
      '--environment',
      'preview',
      '--search',
      "it's",
      '--limit',
      '2',
      '--since',
      '1d',
      '--next',
      '2'
    );
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery).toMatchObject({
      page: '2',
      pageSize: '2',
      environment: 'preview',
      search: "it's",
    });
    expect(receivedQuery).not.toHaveProperty('cursor');
    const sinceIso = new Date(Number(receivedQuery?.from) * 1000).toISOString();
    const untilIso = new Date(Number(receivedQuery?.to) * 1000).toISOString();
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Next page:');
    expect(stderr).toContain(
      String.raw`vercel --cwd 'project dir' --scope my-team agent-runs list --environment preview --query 'it'\''s' --limit 2 --since ${sinceIso} --until ${untilIso} --next=3`
    );
    expect(stderr).not.toContain('synthetic-secret-token');
  });

  it('rejects a cursor used with a different search', async () => {
    const next = await fetchFirstPageToken('--search', 'checkout');

    client.setArgv('agent-runs', 'list', '--search', 'billing', '--next', next);
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(2);
    expect(requests).toHaveLength(1);
    expect(client.stderr.getFullOutput()).toContain(
      'The `--next` cursor belongs to a different list.'
    );
  });

  it('rejects a cursor used with a different time range', async () => {
    const next = await fetchFirstPageToken();

    client.setArgv('agent-runs', 'list', '--since', '1h', '--next', next);
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(2);
    expect(requests).toHaveLength(1);
    expect(client.stderr.getFullOutput()).toContain(
      '`--since` and `--until` must match the time range of the `--next` cursor.'
    );
  });

  it('accepts the same absolute time range with a cursor', async () => {
    const next = await fetchFirstPageToken();

    client.setArgv(
      'agent-runs',
      'list',
      '--since',
      since,
      '--until',
      until,
      '--next',
      next,
      '--json'
    );
    expect(await agentRuns(client)).toBe(0);
    expect(requests[1]).toMatchObject({ cursor: expectedSourceCursor });
  });

  it.each([
    ['not-a-cursor'],
    ['eyJ2ZXJzaW9uIjoyfQ'],
    [''],
  ])('rejects malformed cursor %j before fetching', async value => {
    client.setArgv('agent-runs', 'list', '--next', value);
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(2);
    expect(requests).toHaveLength(0);
    expect(client.stderr.getFullOutput()).toContain(
      'Invalid or expired `--next` cursor.'
    );
  });

  it('rejects --next together with --page', async () => {
    client.setArgv('agent-runs', 'list', '--next', '2', '--page', '2');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(2);
    expect(requests).toHaveLength(0);
  });

  it('redacts cursor values in telemetry', async () => {
    const next = await fetchFirstPageToken();
    client.telemetryEventStore.reset();

    client.setArgv('agent-runs', 'list', '--next', next, '--json');
    expect(await agentRuns(client)).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:list', value: 'list' },
      { key: 'option:next', value: '[REDACTED]' },
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
    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Unknown subcommand: bogus'
    );
  });

  it('prints subcommand help for `agent runs --help`', async () => {
    client.setArgv('agent-runs', 'list', '--help');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'agent-runs:list' },
    ]);
  });
});
