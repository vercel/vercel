import open from 'open';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import traces from '../../../../src/commands/traces';
import * as linkModule from '../../../../src/util/projects/link';
import type { Trace } from '../../../../src/commands/traces/types';

vi.mock('../../../../src/util/projects/link');

vi.mock('open', () => ({
  default: vi.fn(),
}));

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedOpen = vi.mocked(open);

function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_test',
      name: 'traces-project',
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: {
      id: 'team_dummy',
      slug: 'my-team',
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
      status: { code: 0 },
    },
    {
      spanId: 'span_invoke',
      name: 'invoke',
      duration: [0, 18_000_000],
      status: { code: 0 },
    },
  ],
};

describe('vercel traces get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockedOpen.mockResolvedValue(undefined as never);
  });

  it('prints the markdown summary to stdout for a 200 response', async () => {
    mockLinkedProject();
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/v1/projects/traces', (req, res) => {
      receivedQuery = req.query as Record<string, unknown>;
      res.json({ trace: sampleTrace });
    });

    client.setArgv('traces', 'get', 'req_abc');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery).toEqual({
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

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Run with --json for full trace data.');
  });

  it('works when `get` is omitted (shortcut form)', async () => {
    mockLinkedProject();
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

  it('shows help and exits 2 when no requestId is provided', async () => {
    mockLinkedProject();
    client.setArgv('traces', 'get');
    const exitCode = await traces(client);

    expect(exitCode).toBe(2);
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
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/v1/projects/traces', (req, res) => {
      receivedQuery = req.query as Record<string, unknown>;
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
    expect(receivedQuery).toEqual({
      teamId: 'team-from-flag',
      projectId: 'project-from-flag',
      requestId: 'req_flags',
    });
  });

  it('lets --scope and --project override the linked project', async () => {
    mockLinkedProject();
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/v1/projects/traces', (req, res) => {
      receivedQuery = req.query as Record<string, unknown>;
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
    expect(receivedQuery).toEqual({
      teamId: 'other-team',
      projectId: 'other-project',
      requestId: 'req_override',
    });
  });

  it('falls back to the linked team when only --project is provided', async () => {
    mockLinkedProject();
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/v1/projects/traces', (req, res) => {
      receivedQuery = req.query as Record<string, unknown>;
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
    expect(receivedQuery).toEqual({
      teamId: 'team_dummy',
      projectId: 'other-project',
      requestId: 'req_partial',
    });
  });

  it('exits 1 on 404 without retrying', async () => {
    mockLinkedProject();
    let calls = 0;
    client.scenario.get('/v1/projects/traces', (_req, res) => {
      calls += 1;
      res.status(404).json({ error: { message: 'not found' } });
    });

    client.setArgv('traces', 'get', 'req_missing');
    const exitCode = await traces(client);

    expect(calls).toBe(1);
    expect(exitCode).toBe(1);
  });

  it('exits 1 immediately on 401 without retrying', async () => {
    mockLinkedProject();
    let calls = 0;
    client.scenario.get('/v1/projects/traces', (_req, res) => {
      calls += 1;
      res.status(401).json({ error: { message: 'unauthorized' } });
    });

    client.setArgv('traces', 'get', 'req_401');
    const exitCode = await traces(client);

    expect(calls).toBe(1);
    expect(exitCode).toBe(1);
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

    it('appends ?view=gantt when --view=gantt', async () => {
      mockLinkedProject();
      client.scenario.get('/v1/projects/traces', (_req, res) => {
        res.json({ trace: sampleTrace });
      });

      client.setArgv('traces', 'get', 'req_gantt', '--open', '--view', 'gantt');
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(mockedOpen).toHaveBeenCalledWith(
        'https://vercel.com/my-team/traces-project/logs/traces/trace_001?view=gantt'
      );
    });

    it('errors when --open and --json are combined', async () => {
      client.setArgv('traces', 'get', 'req_x', '--open', '--json');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        '`--json` and `--open` cannot be used together.'
      );
      expect(mockedOpen).not.toHaveBeenCalled();
    });

    it('errors when --view is used without --open', async () => {
      client.setArgv('traces', 'get', 'req_x', '--view', 'tree');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        '`--view` can only be used with `--open`.'
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

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        '`--view` must be one of: timeline, tree, gantt. Received: flamegraph'
      );
      expect(mockedOpen).not.toHaveBeenCalled();
    });

    it('resolves --scope=team_id via /teams/:id to get the slug', async () => {
      mockNotLinked();
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
      expect(payload.message).toBe('`--view` can only be used with `--open`.');

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
        '`--view` must be one of: timeline, tree, gantt. Received: flamegraph'
      );

      exitSpy.mockRestore();
    });

    it('emits not_found JSON when --open --project resolves to an unknown project', async () => {
      const exitSpy = spyExit();
      mockNotLinked();
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
});
