import { ReadableStream } from 'node:stream/web';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';

const { mockFetch, mockCollectVersionContext } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockCollectVersionContext: vi.fn(),
}));

vi.mock('../../../../src/util/fetch', () => ({ default: mockFetch }));
vi.mock('../../../../src/util/telemetry/version-context-cache', () => ({
  collectCachedVersionContextForTelemetry: mockCollectVersionContext,
}));

import flush from '../../../../src/commands/telemetry/flush';
import type Client from '../../../../src/util/client';

const payload = [
  JSON.stringify({
    headers: { 'x-vercel-cli-session-id': 'session' },
    body: [
      {
        id: 'event-id',
        event_time: 1,
        key: 'platform',
        value: 'darwin',
      },
    ],
  }),
];

describe('telemetry flush', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      status: 204,
      headers: new Headers({ 'x-vercel-cli-tracked': '1' }),
    });
    mockCollectVersionContext.mockResolvedValue({
      status: 'cancelled',
      source: 'cache',
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mockFetch.mockReset();
    mockCollectVersionContext.mockReset();
    vi.unstubAllEnvs();
  });

  it('sends the legacy event array when no command trace is queued', async () => {
    expect(await flush(client, payload)).toBe(0);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(Array.isArray(JSON.parse(mockFetch.mock.calls[0][1].body))).toBe(
      true
    );
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)[0]).toEqual(
      JSON.parse(payload[0]).body[0]
    );
  });

  it('sends one bridge request with the parent trace', async () => {
    vi.stubEnv('VERCEL_TELEMETRY_DISABLED', '1');
    const trace = {
      event: {
        id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
        name: 'vc.cli.command',
        timestamp: 123,
        startTime: 1_700_000_000_000,
        duration: 123_456,
        tags: {
          command: 'whoami',
          invocation_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
          cli_version: '64.5.0',
          outcome: 'success',
        },
      },
      buildLabel: 'preview',
    };
    const original = JSON.parse(payload[0]);
    original.body[0].invocation_id = 'explicit-owner';
    const serialized = JSON.stringify({
      ...original,
      invocationId: trace.event.tags.invocation_id,
      commandTrace: trace,
    });

    expect(await flush(client, [serialized])).toBe(0);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, request] = mockFetch.mock.calls[0];
    expect(url).toBe('https://telemetry.vercel.com/api/vercel-cli/v1/events');
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual(original.headers);
    const sent = JSON.parse(request.body);
    expect(sent).toEqual({
      version: 1,
      events: expect.any(Array),
      commandTrace: trace,
    });
    expect(sent.events[0]).toEqual(original.body[0]);
    expect(sent.events.slice(1).length).toBeGreaterThan(0);
    for (const event of sent.events.slice(1)) {
      expect(event.invocation_id).toBe(trace.event.tags.invocation_id);
    }
    expect(request.body).not.toMatch(/resourceSpans|dd-api-key|clientToken/);
  });

  it('reads the parent handoff from stdin without an argv payload', async () => {
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(
      Readable.from([payload[0]]) as unknown as typeof process.stdin
    );

    expect(await flush(client, [])).toBe(0);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)[0]).toEqual(
      JSON.parse(payload[0]).body[0]
    );
  });

  it.each([
    ['empty', ''],
    ['truncated', payload[0].slice(0, 20)],
    ['wrong shape', JSON.stringify({ headers: {}, body: {} })],
  ])('drops an %s handoff without throwing', async (_, serialized) => {
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(
      Readable.from(
        serialized ? [serialized] : []
      ) as unknown as typeof process.stdin
    );
    await expect(flush(client, [])).resolves.toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('adds resolved version context to the original telemetry batch', async () => {
    const versionContext = {
      status: 'resolved',
      source: 'cache',
      runtime: 'native',
      manager: 'installer',
      track: 'production',
      slot: 'a',
    };
    mockCollectVersionContext.mockResolvedValue(versionContext);
    const originalEvent = {
      id: 'event-id',
      event_time: 1,
      team_id: 'team-id',
      user_id: 'user-id',
      project_id: 'project-id',
      key: 'platform',
      value: 'darwin',
    };

    const exitCode = await flush(
      {
        config: {
          updates: { auto: true, bypassMinReleaseAge: false },
          credStorage: 'keyring',
        },
      } as unknown as Client,
      [
        JSON.stringify({
          headers: { 'Client-id': 'vercel-cli' },
          body: [originalEvent],
        }),
      ]
    );

    expect(exitCode).toBe(0);
    const request = mockFetch.mock.calls[0][1];
    const body = JSON.parse(request.body);
    expect(body[0]).toEqual(originalEvent);
    expect(
      body.slice(1).map(({ key, value }: { key: string; value: string }) => ({
        key,
        value,
      }))
    ).toEqual([
      { key: 'version_context_status', value: 'resolved' },
      { key: 'version_context_source', value: 'cache' },
      { key: 'version_context_runtime', value: 'native' },
      { key: 'version_context_manager', value: 'installer' },
      { key: 'version_context_track', value: 'production' },
      { key: 'version_context_slot', value: 'a' },
      { key: 'config_auto_update', value: 'enabled' },
      { key: 'config_bypass_min_release_age', value: 'disabled' },
      { key: 'config_credential_storage', value: 'keyring' },
    ]);
    expect(body.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          event_time: expect.any(Number),
          team_id: 'team-id',
          user_id: 'user-id',
          project_id: 'project-id',
        }),
      ])
    );
  });

  it('sends the original batch when version context collection fails', async () => {
    mockCollectVersionContext.mockRejectedValue(
      new Error('version context failed')
    );

    await expect(flush(client, payload)).resolves.toBe(0);

    const request = mockFetch.mock.calls[0][1];
    const body = JSON.parse(request.body);
    expect(body[0]).toEqual({
      id: 'event-id',
      event_time: 1,
      key: 'platform',
      value: 'darwin',
    });
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'version_context_status',
          value: 'error',
        }),
      ])
    );
  });

  it.each([
    { invocationId: undefined, eventId: undefined, expectedId: undefined },
    { invocationId: undefined, eventId: null, expectedId: null },
    {
      invocationId: undefined,
      eventId: 'explicit-owner',
      expectedId: 'explicit-owner',
    },
    {
      invocationId: 'original-command',
      eventId: undefined,
      expectedId: 'original-command',
    },
    {
      invocationId: 'original-command',
      eventId: 'explicit-owner',
      expectedId: 'explicit-owner',
    },
  ])('preserves event ownership for %j', async ({
    invocationId,
    eventId,
    expectedId,
  }) => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const headers = { 'x-vercel-cli-session-id': 'shared-session' };
    const event = {
      id: 'event-id',
      event_time: 1_000,
      invocation_id: eventId,
      key: 'platform',
      value: 'linux',
    };
    const args = [JSON.stringify({ invocationId, headers, body: [event] })];

    await flush(client, args);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://telemetry.vercel.com/api/vercel-cli/v1/events',
      expect.objectContaining({
        headers,
      })
    );
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)[0]).toEqual(
      JSON.parse(JSON.stringify({ ...event, invocation_id: expectedId }))
    );
    for (const event of JSON.parse(mockFetch.mock.calls[0][1].body).slice(1)) {
      expect(event.invocation_id).toBe(invocationId);
    }
    expect(invocationId).not.toBe(
      client.telemetryEventStore.currentInvocationId
    );
  });

  it('retains owners in a reordered batch and decorates flush-added context', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const first = {
      id: 'first',
      event_time: 1_000,
      key: 'arch',
      value: 'arm64',
      invocation_id: 'command-a',
    };
    const second = {
      id: 'second',
      event_time: 1_000,
      key: 'arch',
      value: 'x64',
      invocation_id: 'command-b',
    };
    const context = {
      id: 'context',
      event_time: 2_000,
      key: 'version_context_runtime',
      value: 'native',
    };
    const body = [second, first, context, first];

    await flush(client, [
      JSON.stringify({
        invocationId: 'command-a',
        headers: { 'x-vercel-cli-session-id': 'shared-session' },
        body,
      }),
    ]);

    const sent = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sent.slice(0, body.length)).toEqual([
      second,
      first,
      { ...context, invocation_id: 'command-a' },
      first,
    ]);
    expect(sent.slice(body.length).length).toBeGreaterThan(0);
    for (const event of sent.slice(body.length)) {
      expect(event.invocation_id).toBe('command-a');
    }
    expect(body).toEqual([second, first, context, first]);
  });

  it('aborts a telemetry request at its deadline', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    mockFetch.mockImplementation(
      (_url: string, options: { signal: AbortSignal }) => {
        signal = options.signal;
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(options.signal.reason),
            { once: true }
          );
        });
      }
    );

    const result = flush(client, payload, { timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toBe(1);
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://telemetry.vercel.com/api/vercel-cli/v1/events',
      expect.objectContaining({ signal })
    );
  });

  it('does not wait for a response body to cancel after receiving headers', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    mockFetch.mockResolvedValue(
      new Response(
        new ReadableStream({
          cancel,
          start() {},
        }),
        { status: 500 }
      )
    );

    await expect(flush(client, payload, { timeoutMs: 100 })).resolves.toBe(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the deadline after a successful request', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: { 'x-vercel-cli-tracked': '1' },
      })
    );

    await expect(flush(client, payload, { timeoutMs: 100 })).resolves.toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://telemetry.vercel.com/api/vercel-cli/v1/events',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});
