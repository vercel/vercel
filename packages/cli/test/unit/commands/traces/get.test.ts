import open from 'open';
import stripAnsi from 'strip-ansi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import traces from '../../../../src/commands/traces';
import * as fetchTraceModule from '../../../../src/commands/traces/fetch-trace';
import { renderMarkdown } from '../../../../src/commands/traces/render-markdown';
import * as linkModule from '../../../../src/util/projects/link';
import type { Trace } from '../../../../src/commands/traces/types';
import { teamCache } from '../../../../src/util/teams/get-team-by-id-or-slug';
import chars from '../../../../src/util/output/chars';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/commands/traces/fetch-trace');

vi.mock('open', () => ({
  default: vi.fn(),
}));

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedFetchTrace = vi.mocked(fetchTraceModule.fetchTrace);
const mockedOpen = vi.mocked(open);

function mockLinkedProject(
  teamSlug = 'my-team',
  projectName = 'traces-project'
) {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_test',
      name: projectName,
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: {
      id: 'team_dummy',
      slug: teamSlug,
      type: 'team',
    },
  });
}

function mockNotLinked() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'not_linked',
    org: null,
    project: null,
  });
}

const sampleTrace: Trace = {
  traceId: 'trace_001',
  rootSpanId: 'span_root',
  spans: [
    {
      spanId: 'span_root',
      name: 'GET /api/hello',
      duration: [0, 25_000_000],
      attributes: {
        'http.method': 'GET',
        'http.target': '/api/hello',
        'http.status_code': 200,
      },
      status: { code: 'Unset' },
    },
    {
      spanId: 'span_invoke',
      name: 'invoke',
      duration: [0, 18_000_000],
      status: { code: 'Unset' },
    },
  ],
};

describe('vercel traces get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    teamCache.clear();
    client.reset();
    mockedOpen.mockResolvedValue(undefined as never);
    mockedFetchTrace.mockResolvedValue({ trace: sampleTrace, partial: false });
  });

  it('prints the markdown summary to stdout when stdout is not a TTY', async () => {
    mockLinkedProject();
    client.stdout.isTTY = false;
    client.setArgv('traces', 'get', 'req_abc');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(mockedFetchTrace).toHaveBeenCalledWith({
      client,
      teamId: 'team_dummy',
      projectId: 'prj_test',
      requestId: 'req_abc',
    });

    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('# Trace trace_001');
    expect(stdout).toContain('**Trace id:** trace_001');
    expect(stdout).toContain('**Request id:** req_abc');
    expect(stdout).toContain('**Endpoint:** `GET /api/hello` → 200');
    expect(stdout).toContain('**Spans:** 2');
    expect(stdout).toContain('## Span tree');
    expect(stdout).not.toContain('Duration  ');

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      'View trace: https://vercel.com/my-team/traces-project/logs/traces/trace_001'
    );
    expect(stderr).toContain('Run with --json for full trace data.');
  });

  it('prints the markdown summary in non-interactive mode even on a TTY', async () => {
    mockLinkedProject();
    client.nonInteractive = true;
    client.setArgv('traces', 'get', 'req_abc');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toContain('## Span tree');
  });

  it('prints the markdown summary on a TTY by default', async () => {
    mockLinkedProject();
    client.setArgv('traces', 'get', 'req_abc');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toBe(
      renderMarkdown(sampleTrace, { requestId: 'req_abc' })
    );
  });

  it.each([
    'terminal',
    'agent',
  ])('prints the waterfall chart with --view waterfall in %s output', async mode => {
    mockLinkedProject();
    if (mode === 'agent') client.isAgent = true;
    client.setArgv('traces', 'get', 'req_abc', '--view', 'waterfall');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('  Trace           trace_001');
    expect(stdout).toContain('  Request         req_abc');
    expect(stdout).toContain('  Endpoint        GET /api/hello → 200');
    expect(stdout).toMatch(/Span\s+Duration\s+0ms/);
    expect(stdout).toContain('█');
    expect(stdout).not.toContain('## Span tree');
    expect(stdout).not.toContain('**Trace id:**');
    expect(client.stderr.getFullOutput()).toContain(
      'Run with --json for full trace data.'
    );
  });

  it('works when `get` is omitted (shortcut form)', async () => {
    mockLinkedProject();
    client.stdout.isTTY = false;
    client.scenario.get('/v1/projects/traces', (_req, res) => {
      res.json({ trace: sampleTrace });
    });

    client.setArgv('traces', 'req_shortcut');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toContain(
      '**Request id:** req_shortcut'
    );
  });

  it('fetches the trace as inspect without a deprecation warning', async () => {
    mockLinkedProject();
    client.setArgv('traces', 'inspect', 'req_abc');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(mockedFetchTrace).toHaveBeenCalledWith({
      client,
      teamId: 'team_dummy',
      projectId: 'prj_test',
      requestId: 'req_abc',
    });
    expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
  });

  it('warns for the deprecated get name and still reads the id after it', async () => {
    mockLinkedProject();
    client.setArgv('traces', 'get', 'req_abc');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(mockedFetchTrace).toHaveBeenCalledWith({
      client,
      teamId: 'team_dummy',
      projectId: 'prj_test',
      requestId: 'req_abc',
    });
    expect(client.stderr.getFullOutput()).toContain(
      '`vercel traces get` is deprecated. Use `vercel traces inspect`.'
    );
  });

  it('does not warn for the deprecated get name with --json', async () => {
    mockLinkedProject();
    client.setArgv('traces', 'get', 'req_abc', '--json');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
  });

  it('prints the raw trace JSON to stdout with --json', async () => {
    mockLinkedProject();
    client.scenario.get('/v1/projects/traces', (_req, res) => {
      res.json({ trace: sampleTrace });
    });

    client.setArgv('traces', 'get', 'req_json', '--json');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput().trim();
    expect(JSON.parse(stdout)).toEqual(sampleTrace);
    expect(stdout).not.toContain('Run with --json');
  });

  it('prints top-level help to stderr and exits 0', async () => {
    client.setArgv('traces', '--help');
    expect(await traces(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('traces');
    expect(client.stdout.getFullOutput()).toBe('');
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
    expect(mockedFetchTrace).not.toHaveBeenCalled();
  });

  it.each([
    { flags: [], expectedExitCode: 2 },
    { flags: ['--help'], expectedExitCode: 0 },
  ])('shows lookup guidance in help: $flags', async ({
    flags,
    expectedExitCode,
  }) => {
    mockLinkedProject();
    client.setArgv('traces', 'get', ...flags);
    const exitCode = await traces(client);

    expect(exitCode).toBe(expectedExitCode);
    const helpOutput = stripAnsi(client.stderr.getFullOutput()).replace(
      /\s+/g,
      ' '
    );
    expect(helpOutput).toContain('Trace-ID lookup');
    expect(helpOutput).toContain(
      'A 32-character hexadecimal ID selects trace-ID lookup. Other IDs select request-ID lookup.'
    );
    expect(helpOutput).toContain('traces inspect <id> [options]');
    expect(helpOutput).not.toContain('--trace-id');
    expect(helpOutput).not.toContain('--request-id');
    expect(helpOutput).toContain('Request-ID lookup');
    expect(stripAnsi(client.stderr.getFullOutput())).toMatch(
      /timestamp\.[ ]*\n[ ]*\n {2}If no matching root/
    );
    expect(helpOutput).toContain(
      'does not guarantee traces inspect can retrieve the trace'
    );
    expect(helpOutput).toContain(
      'matching root span in the same project within 30 minutes after the request-ID timestamp'
    );
    expect(helpOutput).toContain(
      'If no matching root is found, lookup returns 404.'
    );
    expect(helpOutput).toContain(
      'Use the same --scope and --project for search and inspect.'
    );
    expect(helpOutput).not.toContain('search and get');
    expect(helpOutput).not.toContain('KQL fields');
    expect(client.stdout.getFullOutput()).toBe('');
    expect(mockedFetchTrace).not.toHaveBeenCalled();
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
  });

  it('exits 1 with an actionable error when the directory is not linked', async () => {
    mockNotLinked();

    client.setArgv('traces', 'get', 'req_no_link');
    const exitCode = await traces(client);

    expect(exitCode).toBe(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('vercel link');
    expect(stderr).toContain('--scope');
    expect(stderr).toContain('--project');
  });

  it('works from a non-linked dir with --scope and --project flags', async () => {
    mockNotLinked();
    client.config.currentTeam = 'team_canonical';
    client.scenario.get('/v9/projects/project-from-flag', (_req, res) => {
      res.json({ id: 'prj_canonical', name: 'project-from-flag' });
    });
    client.scenario.get('/v1/projects/traces', (_req, res) => {
      res.json({ trace: sampleTrace });
    });

    client.setArgv(
      'traces',
      'get',
      'req_flags',
      '--scope',
      'team-from-flag',
      '--project',
      'project-from-flag'
    );
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(mockedFetchTrace).toHaveBeenCalledWith({
      client,
      teamId: 'team_canonical',
      projectId: 'prj_canonical',
      requestId: 'req_flags',
    });
  });

  it('lets --scope and --project override the linked project', async () => {
    mockLinkedProject();
    client.config.currentTeam = 'team_other';
    client.scenario.get('/v9/projects/other-project', (_req, res) => {
      res.json({ id: 'prj_other', name: 'other-project' });
    });
    client.scenario.get('/v1/projects/traces', (_req, res) => {
      res.json({ trace: sampleTrace });
    });

    client.setArgv(
      'traces',
      'get',
      'req_override',
      '--scope',
      'other-team',
      '--project',
      'other-project'
    );
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(mockedFetchTrace).toHaveBeenCalledWith({
      client,
      teamId: 'team_other',
      projectId: 'prj_other',
      requestId: 'req_override',
    });
  });

  it('falls back to the linked team when only --project is provided', async () => {
    mockLinkedProject();
    client.scenario.get('/v9/projects/other-project', (_req, res) => {
      res.json({ id: 'prj_other', name: 'other-project' });
    });
    client.scenario.get('/v1/projects/traces', (_req, res) => {
      res.json({ trace: sampleTrace });
    });

    client.setArgv(
      'traces',
      'get',
      'req_partial',
      '--project',
      'other-project'
    );
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(mockedFetchTrace).toHaveBeenCalledWith({
      client,
      teamId: 'team_dummy',
      projectId: 'prj_other',
      requestId: 'req_partial',
    });
  });

  it('exits 1 on a trace lookup error', async () => {
    mockLinkedProject();
    mockedFetchTrace.mockRejectedValue(new Error('not found'));

    client.setArgv('traces', 'get', 'req_missing');
    const exitCode = await traces(client);

    expect(mockedFetchTrace).toHaveBeenCalledTimes(1);
    expect(exitCode).toBe(1);
  });

  it('exits 1 on an authorization error', async () => {
    mockLinkedProject();
    mockedFetchTrace.mockRejectedValue(new Error('unauthorized'));

    client.setArgv('traces', 'get', 'req_401');
    const exitCode = await traces(client);

    expect(mockedFetchTrace).toHaveBeenCalledTimes(1);
    expect(exitCode).toBe(1);
  });

  it.each([
    [[]],
    [['--view', 'waterfall']],
  ])('says the trace is incomplete on stdout, not stderr, with flags %j', async flags => {
    mockLinkedProject();
    mockedFetchTrace.mockResolvedValue({ trace: sampleTrace, partial: true });

    client.setArgv('traces', 'get', 'req_partial', ...flags);
    expect(await traces(client)).toBe(0);

    expect(client.stdout.getFullOutput()).toMatch(
      /incomplete|Exceeded the span limit/
    );
    expect(client.stderr.getFullOutput()).not.toContain('Trace is incomplete');
  });

  it('prints the API reason and retention for a request ID that is too old', async () => {
    mockLinkedProject();
    mockedFetchTrace.mockRejectedValue(
      Object.assign(new Error('Invalid trace request (400)'), {
        status: 400,
        serverMessage: 'Invalid trace request',
        issues: [
          {
            path: 'requestId',
            message: 'Request ID must be within the trace retention window',
          },
        ],
      })
    );

    client.setArgv('traces', 'get', 'req_old');
    expect(await traces(client)).toBe(1);

    expect(client.stderr.getFullOutput()).toContain(
      'Invalid trace request: requestId: Request ID must be within the trace retention window. Traces are kept for 1 hour on Hobby, 1 day on Pro, and 3 days on Enterprise. (400)'
    );
  });

  it('errors when --view and --json are combined', async () => {
    client.setArgv('traces', 'get', 'req_x', '--view', 'waterfall', '--json');

    expect(await traces(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--json` and `--view` cannot be used together.'
    );
    expect(mockedFetchTrace).not.toHaveBeenCalled();
  });

  it('warns when the resolved trace is partial without changing JSON stdout', async () => {
    mockLinkedProject();
    mockedFetchTrace.mockResolvedValue({ trace: sampleTrace, partial: true });

    client.setArgv('traces', 'get', 'req_partial', '--json');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual(sampleTrace);
    expect(client.stderr.getFullOutput()).toContain('Trace is incomplete');
  });

  describe('--open', () => {
    it('opens the dashboard URL using the linked project slug/name', async () => {
      mockLinkedProject();
      client.scenario.get('/v1/projects/traces', (_req, res) => {
        res.json({ trace: sampleTrace });
      });

      client.setArgv('traces', 'get', 'req_open', '--open');
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(mockedOpen).toHaveBeenCalledWith(
        'https://vercel.com/my-team/traces-project/logs/traces/trace_001'
      );
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        'Opening https://vercel.com/my-team/traces-project/logs/traces/trace_001 in your browser...'
      );
      expect(client.stdout.getFullOutput()).toBe('');
    });

    it('omits ?view= when --view is timeline', async () => {
      mockLinkedProject();
      client.scenario.get('/v1/projects/traces', (_req, res) => {
        res.json({ trace: sampleTrace });
      });

      client.setArgv(
        'traces',
        'get',
        'req_timeline',
        '--open',
        '--view',
        'timeline'
      );
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(mockedOpen).toHaveBeenCalledWith(
        'https://vercel.com/my-team/traces-project/logs/traces/trace_001'
      );
    });

    it('appends ?view=tree when --view=tree', async () => {
      mockLinkedProject();
      client.scenario.get('/v1/projects/traces', (_req, res) => {
        res.json({ trace: sampleTrace });
      });

      client.setArgv('traces', 'get', 'req_tree', '--open', '--view', 'tree');
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(mockedOpen).toHaveBeenCalledWith(
        'https://vercel.com/my-team/traces-project/logs/traces/trace_001?view=tree'
      );
    });

    it('appends ?view=waterfall when --view=waterfall', async () => {
      mockLinkedProject();
      client.scenario.get('/v1/projects/traces', (_req, res) => {
        res.json({ trace: sampleTrace });
      });

      client.setArgv(
        'traces',
        'get',
        'req_waterfall',
        '--open',
        '--view',
        'waterfall'
      );
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(mockedOpen).toHaveBeenCalledWith(
        'https://vercel.com/my-team/traces-project/logs/traces/trace_001?view=waterfall'
      );
    });

    it('errors when --open and --json are combined', async () => {
      client.setArgv('traces', 'get', 'req_x', '--open', '--json');
      const exitCode = await traces(client);

      expect(exitCode).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        '`--json` and `--open` cannot be used together.'
      );
      expect(mockedOpen).not.toHaveBeenCalled();
    });

    it('errors when --view is used without --open', async () => {
      client.setArgv('traces', 'get', 'req_x', '--view', 'tree');
      const exitCode = await traces(client);

      expect(exitCode).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        '`--view` can only be used with `--open`, except `--view waterfall`, which draws the chart in the terminal.'
      );
      expect(mockedOpen).not.toHaveBeenCalled();
    });

    it('errors on an invalid --view value', async () => {
      client.setArgv(
        'traces',
        'get',
        'req_x',
        '--open',
        '--view',
        'flamegraph'
      );
      const exitCode = await traces(client);

      expect(exitCode).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        '`--view` must be one of: timeline, tree, waterfall. Received: flamegraph'
      );
      expect(mockedOpen).not.toHaveBeenCalled();
    });

    it('resolves --scope=team_id via /teams/:id to get the slug', async () => {
      mockNotLinked();
      client.config.currentTeam = 'team_abc';
      client.scenario.get('/teams/team_abc', (_req, res) => {
        res.json({
          id: 'team_abc',
          slug: 'team-alpha',
          name: 'Team Alpha',
        });
      });
      client.scenario.get('/v9/projects/project-from-flag', (_req, res) => {
        res.json({
          id: 'prj_xyz',
          name: 'project-from-flag',
          accountId: 'team_abc',
          updatedAt: Date.now(),
          createdAt: Date.now(),
        });
      });
      client.scenario.get('/v1/projects/traces', (_req, res) => {
        res.json({ trace: sampleTrace });
      });

      client.setArgv(
        'traces',
        'get',
        'req_scope',
        '--open',
        '--scope',
        'team_abc',
        '--project',
        'project-from-flag'
      );
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(mockedOpen).toHaveBeenCalledWith(
        'https://vercel.com/team-alpha/project-from-flag/logs/traces/trace_001'
      );
    });

    it('uses --scope verbatim when it is already a slug', async () => {
      mockNotLinked();
      client.config.currentTeam = 'team_abc';
      client.scenario.get('/v9/projects/project-from-flag', (_req, res) => {
        res.json({
          id: 'prj_xyz',
          name: 'project-from-flag',
          accountId: 'team_abc',
          updatedAt: Date.now(),
          createdAt: Date.now(),
        });
      });
      client.scenario.get('/v1/projects/traces', (_req, res) => {
        res.json({ trace: sampleTrace });
      });

      client.setArgv(
        'traces',
        'get',
        'req_slug',
        '--open',
        '--scope',
        'team-alpha',
        '--project',
        'project-from-flag'
      );
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(mockedOpen).toHaveBeenCalledWith(
        'https://vercel.com/team-alpha/project-from-flag/logs/traces/trace_001'
      );
    });
  });

  describe('non-interactive mode', () => {
    afterEach(() => {
      client.nonInteractive = false;
    });

    function readAgentPayload(): Record<string, unknown> {
      const stdout = client.stdout.getFullOutput().trim();
      return JSON.parse(stdout);
    }

    function spyExit() {
      return vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);
    }

    it('emits invalid_arguments JSON when --json and --open are combined', async () => {
      const exitSpy = spyExit();
      client.nonInteractive = true;
      client.setArgv('traces', 'get', 'req_x', '--open', '--json');

      await expect(traces(client)).rejects.toThrow('exit');

      const payload = readAgentPayload();
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_arguments');
      expect(payload.message).toBe(
        '`--json` and `--open` cannot be used together.'
      );

      exitSpy.mockRestore();
    });

    it('emits invalid_arguments JSON when --view is used without --open', async () => {
      const exitSpy = spyExit();
      client.nonInteractive = true;
      client.setArgv('traces', 'get', 'req_x', '--view', 'tree');

      await expect(traces(client)).rejects.toThrow('exit');

      const payload = readAgentPayload();
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_arguments');
      expect(payload.message).toBe(
        '`--view` can only be used with `--open`, except `--view waterfall`, which draws the chart in the terminal.'
      );

      exitSpy.mockRestore();
    });

    it('emits invalid_arguments JSON on an invalid --view value', async () => {
      const exitSpy = spyExit();
      client.nonInteractive = true;
      client.setArgv(
        'traces',
        'get',
        'req_x',
        '--open',
        '--view',
        'flamegraph'
      );

      await expect(traces(client)).rejects.toThrow('exit');

      const payload = readAgentPayload();
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_arguments');
      expect(payload.message).toBe(
        '`--view` must be one of: timeline, tree, waterfall. Received: flamegraph'
      );

      exitSpy.mockRestore();
    });

    it('emits not_found JSON when --open --project resolves to an unknown project', async () => {
      const exitSpy = spyExit();
      mockNotLinked();
      client.config.currentTeam = 'team_abc';
      client.scenario.get('/v1/projects/traces', (_req, res) => {
        res.json({ trace: sampleTrace });
      });
      client.scenario.get('/v9/projects/missing-project', (_req, res) => {
        res.status(404).json({ error: { code: 'not_found' } });
      });

      client.nonInteractive = true;
      client.setArgv(
        'traces',
        'get',
        'req_missing_project',
        '--open',
        '--scope',
        'team-alpha',
        '--project',
        'missing-project'
      );

      await expect(traces(client)).rejects.toThrow('exit');

      const payload = readAgentPayload();
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('not_found');
      expect(payload.message).toBe('Project not found: missing-project');

      exitSpy.mockRestore();
    });
  });

  const TRACE_ID = 'e5c0d1efb3904155472b01692c7f2d00';

  it.each([
    ['get', TRACE_ID],
    ['get', TRACE_ID.toUpperCase()],
    [TRACE_ID],
  ])('detects a trace ID and normalizes hex case: %j', async (...args) => {
    mockLinkedProject();
    mockedFetchTrace.mockResolvedValue({
      trace: { ...sampleTrace, traceId: TRACE_ID },
      partial: false,
    });
    client.stdout.isTTY = false;
    client.setArgv('traces', ...args);

    expect(await traces(client)).toBe(0);
    expect(mockedFetchTrace).toHaveBeenCalledExactlyOnceWith({
      client,
      teamId: 'team_dummy',
      projectId: 'prj_test',
      traceId: TRACE_ID,
    });
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain(`**Trace id:** ${TRACE_ID}`);
    expect(stdout).toContain('## Span tree');
    expect(stdout).not.toContain('Request id');
    expect(stdout).not.toContain('undefined');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'argument:traceId', value: '[REDACTED]' },
    ]);
  });

  it.each([
    'qb46r-1790847620933-1145d2891a3e',
    'fra1::iad1::req-1738800000000-abc',
    'a'.repeat(31),
    'a'.repeat(33),
    'g'.repeat(32),
  ])('preserves request-ID lookup without matching trace-ID format: %s', async id => {
    mockLinkedProject();
    client.setArgv('traces', 'get', id);

    expect(await traces(client)).toBe(0);
    expect(mockedFetchTrace).toHaveBeenCalledExactlyOnceWith({
      client,
      teamId: 'team_dummy',
      projectId: 'prj_test',
      requestId: id,
    });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'argument:requestId', value: '[REDACTED]' },
    ]);
  });

  it.each([
    'pipe',
    'agent',
    'non-interactive',
  ])('renders trace-ID Markdown without a request-ID header for %s output', async mode => {
    mockLinkedProject();
    if (mode === 'pipe') client.stdout.isTTY = false;
    if (mode === 'agent') client.isAgent = true;
    if (mode === 'non-interactive') client.nonInteractive = true;
    client.setArgv('traces', 'get', TRACE_ID);

    expect(await traces(client)).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toBe(renderMarkdown(sampleTrace, {}));
    expect(stdout).not.toContain('Request id');
    expect(stdout).not.toContain('undefined');
  });

  it('preserves raw JSON and partial warnings for trace-ID lookup', async () => {
    mockLinkedProject();
    mockedFetchTrace.mockResolvedValue({ trace: sampleTrace, partial: true });
    client.setArgv('traces', 'get', TRACE_ID, '--json');

    expect(await traces(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual(sampleTrace);
    expect(client.stderr.getFullOutput()).toContain('Trace is incomplete');
    expect(mockedFetchTrace).toHaveBeenCalledTimes(1);
  });

  it('opens the resolved trace for trace-ID input', async () => {
    mockLinkedProject();
    client.setArgv('traces', 'get', TRACE_ID, '--open', '--view', 'waterfall');

    expect(await traces(client)).toBe(0);
    expect(mockedOpen).toHaveBeenCalledExactlyOnceWith(
      'https://vercel.com/my-team/traces-project/logs/traces/trace_001?view=waterfall'
    );
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it.each([
    false,
    true,
  ])('rejects extra identifiers before scope resolution: non-interactive=%s', async nonInteractive => {
    client.nonInteractive = nonInteractive;
    client.setArgv('traces', 'get', TRACE_ID, 'req_abc');

    expect(await traces(client)).toBe(2);
    const stderr = stripAnsi(client.stderr.getFullOutput());
    expect(stderr).toContain(
      `${chars.fatal} Provide one trace ID or request ID.`
    );
    expect(stderr).not.toContain('Error:');
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
    expect(mockedFetchTrace).not.toHaveBeenCalled();
    if (nonInteractive) {
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        reason: 'invalid_arguments',
      });
    } else {
      expect(client.stdout.getFullOutput()).toBe('');
    }
  });

  describe('dashboard link', () => {
    it.each([
      'req_dashboard',
      'a'.repeat(32),
    ])('links the resolved trace for input %s without opening a browser', async id => {
      mockLinkedProject('team name', 'project/name');
      mockedFetchTrace.mockResolvedValue({
        trace: { ...sampleTrace, traceId: 'resolved/id' },
        partial: false,
      });
      client.setArgv('traces', 'get', id);

      expect(await traces(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        'View trace: https://vercel.com/team%20name/project%2Fname/logs/traces/resolved%2Fid'
      );
      expect(mockedOpen).not.toHaveBeenCalled();
    });

    it.each([
      ['--scope', ' other-team ', '--project', 'prj_override'],
      ['--scope', 'other-team'],
      ['--project', 'prj_override'],
    ])('uses canonical project names with flags %j', async (...flags) => {
      mockLinkedProject();
      client.config.currentTeam = 'team_override';
      const projectLookup = vi.fn((_req, res) => {
        res.json({ id: 'prj_override', name: 'canonical-project' });
      });
      client.scenario.get(
        flags.includes('--project')
          ? '/v9/projects/prj_override'
          : '/v9/projects/prj_test',
        projectLookup
      );
      client.setArgv('traces', 'get', 'req_dashboard', ...flags);

      expect(await traces(client)).toBe(0);
      const teamSlug = flags.includes('--scope') ? 'other-team' : 'my-team';
      expect(client.stderr.getFullOutput()).toContain(
        `View trace: https://vercel.com/${teamSlug}/canonical-project/logs/traces/trace_001`
      );
      expect(projectLookup).toHaveBeenCalledTimes(1);
    });

    it.each([
      false,
      true,
    ])('resolves team IDs only for human output (json=%s)', async json => {
      mockNotLinked();
      client.config.currentTeam = 'team_dashboard';
      const teamLookup = vi.fn((_req, res) => {
        res.json({ id: 'team_dashboard', slug: 'dashboard-team' });
      });
      client.scenario.get('/teams/team_dashboard', teamLookup);
      client.scenario.get('/v9/projects/prj_dashboard', (_req, res) => {
        res.json({ id: 'prj_dashboard', name: 'dashboard-project' });
      });
      client.setArgv(
        'traces',
        'get',
        'req_dashboard',
        '--scope',
        'team_dashboard',
        '--project',
        'prj_dashboard',
        ...(json ? ['--json'] : [])
      );

      expect(await traces(client)).toBe(0);
      if (json) {
        expect(JSON.parse(client.stdout.getFullOutput())).toEqual(sampleTrace);
        expect(teamLookup).not.toHaveBeenCalled();
        expect(client.stderr.getFullOutput()).not.toContain('View trace:');
      } else {
        expect(teamLookup).toHaveBeenCalledTimes(1);
        expect(client.stderr.getFullOutput()).toContain(
          'View trace: https://vercel.com/dashboard-team/dashboard-project/logs/traces/trace_001'
        );
      }
    });

    it('preserves the summary when dashboard team resolution fails', async () => {
      mockNotLinked();
      client.config.currentTeam = 'team_dashboard_missing';
      client.scenario.get('/teams/team_dashboard_missing', (_req, res) => {
        res.status(404).json({ error: { code: 'not_found' } });
      });
      client.scenario.get('/v9/projects/prj_dashboard', (_req, res) => {
        res.json({ id: 'prj_dashboard', name: 'dashboard-project' });
      });
      client.setArgv(
        'traces',
        'inspect',
        'req_dashboard',
        '--scope',
        'team_dashboard_missing',
        '--project',
        'prj_dashboard'
      );

      expect(await traces(client)).toBe(0);
      expect(client.stdout.getFullOutput()).toContain('trace_001');
      const stderr = stripAnsi(client.stderr.getFullOutput());
      expect(stderr).toMatch(
        /^! Failed to resolve the dashboard URL\. Use --open to retry\.$/m
      );
      expect(stderr).not.toContain('WARNING!');
      expect(stderr).not.toContain('Unable to');
      expect(client.stderr.getFullOutput()).toContain('Run with --json');
    });
  });

  const traceWithRequestId: Trace = {
    ...sampleTrace,
    spans: [...sampleTrace.spans].reverse().map(span => ({
      ...span,
      attributes: {
        ...span.attributes,
        'vercel.request_id':
          span.spanId === sampleTrace.rootSpanId ? 'req_resolved' : 'req_child',
      },
    })),
  };

  it.each([
    'terminal',
    'waterfall',
    'pipe',
    'agent',
    'non-interactive',
  ])('prints the resolved request ID for trace-ID lookup in %s output', async mode => {
    mockLinkedProject();
    if (mode === 'pipe') client.stdout.isTTY = false;
    if (mode === 'agent') client.isAgent = true;
    if (mode === 'non-interactive') client.nonInteractive = true;
    mockedFetchTrace.mockResolvedValue({
      trace: { ...traceWithRequestId, traceId: TRACE_ID },
      partial: false,
    });
    client.setArgv(
      'traces',
      'get',
      TRACE_ID,
      ...(mode === 'waterfall' ? ['--view', 'waterfall'] : [])
    );

    expect(await traces(client)).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain(TRACE_ID);
    // --view waterfall gets the chart summary; every other mode gets Markdown.
    if (mode === 'waterfall') {
      expect(stdout).toMatch(/Request\s+req_resolved/);
    } else {
      expect(stdout).toContain('Request id');
    }
    expect(stdout).toContain('req_resolved');
    expect(stdout).not.toContain('undefined');
  });

  it('preserves the supplied request ID including region prefixes', async () => {
    mockLinkedProject();
    mockedFetchTrace.mockResolvedValue({
      trace: traceWithRequestId,
      partial: false,
    });
    const requestId = 'fra1::iad1::req_resolved';
    client.setArgv('traces', 'get', requestId);

    expect(await traces(client)).toBe(0);
    expect(client.stdout.getFullOutput()).toContain(requestId);
  });

  it('preserves raw JSON including the request-ID attribute', async () => {
    mockLinkedProject();
    mockedFetchTrace.mockResolvedValue({
      trace: traceWithRequestId,
      partial: false,
    });
    client.setArgv('traces', 'get', TRACE_ID, '--json');

    expect(await traces(client)).toBe(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json).toEqual(traceWithRequestId);
    expect(json).not.toHaveProperty('requestId');
  });

  it.each([
    undefined,
    null,
    '',
    '   ',
    123,
    false,
  ])('omits invalid root request-ID attributes without using child IDs: %j', async requestId => {
    mockLinkedProject();
    const trace = {
      ...traceWithRequestId,
      spans: traceWithRequestId.spans.map(span =>
        span.spanId === traceWithRequestId.rootSpanId
          ? { ...span, attributes: { 'vercel.request_id': requestId } }
          : span
      ),
    };
    mockedFetchTrace.mockResolvedValue({ trace, partial: false });
    client.setArgv('traces', 'get', TRACE_ID);

    expect(await traces(client)).toBe(0);
    expect(client.stdout.getFullOutput()).not.toContain('Request id');
    expect(client.stdout.getFullOutput()).not.toContain('req_child');
  });
});
