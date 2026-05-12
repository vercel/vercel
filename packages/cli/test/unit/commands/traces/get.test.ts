import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import traces from '../../../../src/commands/traces';
import * as linkModule from '../../../../src/util/projects/link';
import type { Trace } from '../../../../src/commands/traces/types';

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

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
      attributes: { 'func.cold': true },
      status: { code: 0 },
    },
  ],
};

describe('vercel traces get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
  });

  it('prints the summary block to stdout for a 200 response', async () => {
    mockLinkedProject();
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/api/v1/projects/traces', (req, res) => {
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
    expect(stdout).toContain('Trace id:     trace_001');
    expect(stdout).toContain('Request id:   req_abc');
    expect(stdout).toContain('Status:       200');
    expect(stdout).toContain('Method/path:  GET /api/hello');
    expect(stdout).toContain('Cold start:   yes');
    expect(stdout).toContain('Spans:        2');
    expect(stdout).toContain('Errors:       0');

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Run with --json for full trace data.');
  });

  it('works when `get` is omitted (shortcut form)', async () => {
    mockLinkedProject();
    client.scenario.get('/api/v1/projects/traces', (_req, res) => {
      res.json({ trace: sampleTrace });
    });

    client.setArgv('traces', 'req_shortcut');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toContain(
      'Request id:   req_shortcut'
    );
  });

  it('prints the raw trace JSON to stdout with --json', async () => {
    mockLinkedProject();
    client.scenario.get('/api/v1/projects/traces', (_req, res) => {
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
    client.scenario.get('/api/v1/projects/traces', (req, res) => {
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
    client.scenario.get('/api/v1/projects/traces', (req, res) => {
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
    client.scenario.get('/api/v1/projects/traces', (req, res) => {
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
});
