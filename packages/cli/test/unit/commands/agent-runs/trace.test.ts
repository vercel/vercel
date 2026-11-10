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

function traceCursor(
  value:
    | { direction: 'later'; streamId: string; cursor: string }
    | { direction: 'earlier'; streamId: string; beforeChunk: number }
) {
  return Buffer.from(JSON.stringify({ version: 1, ...value })).toString(
    'base64url'
  );
}

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

  it('prints opaque previous and next commands and maps them to API pagination', async () => {
    useLinkedProject();
    const pagedTrace = {
      trace: {
        framework: 'eve',
        eve: {
          turns: sampleTrace.trace.eve.turns,
          truncated: { droppedSide: 'newest' },
          earlier: { streamId: 'stream_test', beforeChunk: 1000 },
          later: { streamId: 'stream_test', cursor: 'cursor_test' },
        },
      },
    };
    let requestCount = 0;
    client.scenario.get('/api/observability/agent-runs', (_req, res) => {
      requestCount += 1;
      res.json(pagedTrace);
    });

    client.setArgv(
      'agent-runs',
      'trace',
      'run_001',
      '--cwd',
      'project dir',
      '--scope',
      'my-team',
      '--project',
      'agent-project',
      '--token',
      'token_test'
    );
    let exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(requestCount).toBe(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      'Trace coverage is incomplete: newest activity was not returned in this page.'
    );
    expect(stderr).toContain('  Previous page:\n    vercel ');
    expect(stderr).toContain('  Next page:\n    vercel ');
    expect(stderr).not.toContain('activity is available');
    const previousCursor = stderr.match(/--previous ([A-Za-z0-9_-]+)/)?.[1];
    const nextCursor = stderr.match(/--next ([A-Za-z0-9_-]+)/)?.[1];
    expect(previousCursor).toBeTruthy();
    expect(nextCursor).toBeTruthy();
    expect(stderr).toContain(
      "vercel --cwd 'project dir' --scope my-team agent-runs trace run_001 --project agent-project --previous "
    );
    expect(stderr).toContain(
      "vercel --cwd 'project dir' --scope my-team agent-runs trace run_001 --project agent-project --next "
    );
    expect(stderr).not.toContain('--trace-stream-id');
    expect(stderr).not.toContain('--trace-after-cursor');
    expect(stderr).not.toContain('--trace-before-chunk');
    expect(stderr).not.toContain('token_test');
    expect(stderr).not.toContain('`vercel');

    client.reset();
    process.env.VERCEL_AGENT_RUNS_API_URL = new URL(
      '/api/observability/agent-runs',
      client.apiUrl
    ).href;
    useLinkedProject();
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query;
      res.json({ trace: { framework: 'eve', eve: { turns: [] } } });
    });
    client.setArgv('agent-runs', 'trace', 'run_001', '--next', nextCursor!);
    exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery).toMatchObject({
      runId: 'run_001',
      trace: '1',
      traceStreamId: 'stream_test',
      traceAfterCursor: 'cursor_test',
    });
    expect(receivedQuery).not.toHaveProperty('traceBeforeChunk');

    client.reset();
    process.env.VERCEL_AGENT_RUNS_API_URL = new URL(
      '/api/observability/agent-runs',
      client.apiUrl
    ).href;
    useLinkedProject();
    receivedQuery = undefined;
    client.scenario.get('/api/observability/agent-runs', (req, res) => {
      receivedQuery = req.query;
      res.json({ trace: { framework: 'eve', eve: { turns: [] } } });
    });
    client.setArgv(
      'agent-runs',
      'trace',
      'run_001',
      '--previous',
      previousCursor!
    );
    exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery).toMatchObject({
      runId: 'run_001',
      trace: '1',
      traceStreamId: 'stream_test',
      traceBeforeChunk: '1000',
    });
    expect(receivedQuery).not.toHaveProperty('traceAfterCursor');
  });

  it('preserves pagination metadata on JSON stdout without human continuation output', async () => {
    useLinkedProject();
    const pagedTrace = {
      trace: {
        framework: 'eve',
        eve: {
          turns: sampleTrace.trace.eve.turns,
          later: { streamId: 'stream_test', cursor: 'cursor_test' },
        },
      },
    };
    client.scenario.get('/api/observability/agent-runs', (_req, res) => {
      res.json(pagedTrace);
    });

    client.setArgv('agent-runs', 'trace', 'run_001', '--json');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json).toMatchObject(pagedTrace);
    expect(json.pagination).toEqual({
      next: traceCursor({
        direction: 'later',
        streamId: 'stream_test',
        cursor: 'cursor_test',
      }),
      previous: null,
    });
    expect(client.stdout.getFullOutput()).not.toContain('Next page:');
  });

  it('roundtrips JSON pagination tokens and keeps them intact with field truncation', async () => {
    useLinkedProject();
    const pagedTrace = {
      trace: {
        framework: 'eve',
        eve: {
          turns: [{ content: 'x'.repeat(100) }],
          earlier: { streamId: 'stream_test', beforeChunk: 1000 },
          later: { streamId: 'stream_test', cursor: 'cursor_test' },
        },
      },
      metadata: 'y'.repeat(100),
    };
    client.scenario.get('/api/observability/agent-runs', (_req, res) => {
      res.json(pagedTrace);
    });

    client.setArgv(
      'agent-runs',
      'trace',
      'run_001',
      '--json',
      '--max-field-length',
      '1'
    );
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.pagination).toEqual({
      next: traceCursor({
        direction: 'later',
        streamId: 'stream_test',
        cursor: 'cursor_test',
      }),
      previous: traceCursor({
        direction: 'earlier',
        streamId: 'stream_test',
        beforeChunk: 1000,
      }),
    });

    expect(json.trace.eve.later.cursor).toContain('[truncated');
    expect(json.metadata).toContain('[truncated');

    for (const [flag, token, expected] of [
      [
        '--next',
        json.pagination.next,
        { traceStreamId: 'stream_test', traceAfterCursor: 'cursor_test' },
      ],
      [
        '--previous',
        json.pagination.previous,
        { traceStreamId: 'stream_test', traceBeforeChunk: '1000' },
      ],
    ] as const) {
      client.reset();
      process.env.VERCEL_AGENT_RUNS_API_URL = new URL(
        '/api/observability/agent-runs',
        client.apiUrl
      ).href;
      useLinkedProject();
      let receivedQuery: Record<string, unknown> | undefined;
      client.scenario.get('/api/observability/agent-runs', (req, res) => {
        receivedQuery = req.query;
        res.json({ trace: { framework: 'eve', eve: { turns: [] } } });
      });
      client.setArgv('agent-runs', 'trace', 'run_001', flag, token);
      expect(await agentRuns(client)).toBe(0);
      expect(receivedQuery).toMatchObject(expected);
    }
  });

  it('omits JSON pagination when API metadata is invalid', async () => {
    useLinkedProject();
    client.scenario.get('/api/observability/agent-runs', (_req, res) => {
      res.json({
        trace: {
          framework: 'eve',
          eve: {
            turns: [],
            earlier: { streamId: 'stream_test', beforeChunk: 0 },
            later: { streamId: '', cursor: 'cursor_test' },
          },
        },
      });
    });
    client.setArgv('agent-runs', 'trace', 'run_001', '--json');
    expect(await agentRuns(client)).toBe(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.pagination).toBeUndefined();
    expect(json.trace.eve.earlier).toEqual({
      streamId: 'stream_test',
      beforeChunk: 0,
    });
  });

  it.each([
    ['next', ''],
    ['previous', ''],
    ['next', 'not-json'],
    ['next', 'a'.repeat(4097)],
    [
      'previous',
      traceCursor({
        direction: 'later',
        streamId: 'stream_test',
        cursor: 'cursor_test',
      }),
    ],
  ] as const)('rejects an invalid --%s cursor before resolving scope', async (flag, cursor) => {
    client.setArgv('agent-runs', 'trace', 'run_001', `--${flag}`, cursor);
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      `Invalid or expired \`--${flag}\` cursor. Omit \`--${flag}\` to restart the trace.`
    );
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
  });

  it('rejects conflicting pagination cursors before resolving scope', async () => {
    const cursor = traceCursor({
      direction: 'later',
      streamId: 'stream_test',
      cursor: 'cursor_test',
    });
    client.setArgv(
      'agent-runs',
      'trace',
      'run_001',
      '--next',
      cursor,
      '--previous',
      cursor
    );

    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--next` and `--previous` cannot be used together.'
    );
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
  });

  it('keeps untrusted API cursors out of suggested shell commands', async () => {
    useLinkedProject();
    client.scenario.get('/api/observability/agent-runs', (_req, res) => {
      res.json({
        trace: {
          framework: 'eve',
          eve: {
            turns: sampleTrace.trace.eve.turns,
            truncated: {
              droppedSide: 'newest\u001b[2Jterminal-injection',
            },
            later: {
              streamId: 'stream_test',
              cursor: "cursor'; touch /tmp/pagination-pwned; echo '",
            },
          },
        },
      });
    });

    client.setArgv('agent-runs', 'trace', 'run_001');
    const exitCode = await agentRuns(client);
    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toMatch(/--next [A-Za-z0-9_-]+/);
    expect(stderr).not.toContain('touch /tmp/pagination-pwned');
    expect(stderr).not.toContain("cursor'");
    expect(stderr).not.toContain('terminal-injection');
  });

  it('does not offer unusable continuations', async () => {
    useLinkedProject();
    client.scenario.get('/api/observability/agent-runs', (_req, res) => {
      res.json({
        trace: {
          framework: 'eve',
          eve: {
            turns: sampleTrace.trace.eve.turns,
            earlier: {
              streamId: 'stream_test',
              beforeChunk: Number.MAX_VALUE,
            },
            later: null,
          },
        },
      });
    });

    client.setArgv('agent-runs', 'trace', 'run_001');
    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).not.toContain('Next page:');
    expect(client.stderr.getFullOutput()).not.toContain('Previous page:');
  });

  it('redacts pagination cursors in telemetry', async () => {
    useLinkedProject();
    client.scenario.get('/api/observability/agent-runs', (_req, res) => {
      res.json({ trace: { framework: 'eve', eve: { turns: [] } } });
    });
    client.setArgv(
      'agent-runs',
      'trace',
      'run_001',
      '--next',
      traceCursor({
        direction: 'later',
        streamId: 'stream_test',
        cursor: 'cursor_test',
      })
    );

    const exitCode = await agentRuns(client);

    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:trace', value: 'trace' },
      { key: 'argument:runId', value: '[REDACTED]' },
      { key: 'option:next', value: '[REDACTED]' },
    ]);
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
