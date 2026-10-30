import { describe, expect, it, vi } from 'vitest';
import type Client from '../../../../src/util/client';
import { fetchTrace } from '../../../../src/commands/traces/fetch-trace';

function mockClient(...responses: unknown[]) {
  return {
    fetch: vi.fn().mockImplementation(async () => {
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    }),
  } as unknown as Client;
}

const params = {
  teamId: 'team_123',
  projectId: 'prj_123',
  requestId: 'fra1::iad1::req-1738800000000-abc',
};

describe('fetchTrace', () => {
  it('fetches a trace ID directly and uses the same response mapping', async () => {
    const traceId = 'e5c0d1efb3904155472b01692c7f2d00';
    const client = mockClient({
      traceId,
      rootSpanId: 'span_root',
      spans: [
        {
          spanId: 'span_root',
          name: 'GET /checkout',
          timestamp: '2025-02-06T00:00:00.250Z',
          durationMs: 12.5,
          status: { code: 'ERROR', message: 'failed' },
        },
      ],
      meta: { partial: true },
    });

    expect(
      await fetchTrace({
        client,
        teamId: params.teamId,
        projectId: params.projectId,
        traceId,
      })
    ).toEqual({
      partial: true,
      trace: {
        traceId,
        rootSpanId: 'span_root',
        spans: [
          {
            spanId: 'span_root',
            name: 'GET /checkout',
            startTime: [1_738_800_000, 250_000_000],
            duration: [0, 12_500_000],
            status: { code: 'Error', message: 'failed' },
          },
        ],
      },
    });
    expect(client.fetch).toHaveBeenCalledExactlyOnceWith(
      `https://vercel.com/api/observability-api/v1/traces/${traceId}?teamId=team_123&projectId=prj_123`,
      { headers: { 'x-vercel-observability-query-reason': 'cli/traces-get' } }
    );
  });

  it.each([
    400, 401, 403, 404, 502,
  ])('surfaces trace-ID lookup failures without request-ID fallback: %s', async status => {
    const error = Object.assign(new Error('lookup failed'), { status });
    const client = mockClient(error);
    await expect(
      fetchTrace({
        client,
        teamId: params.teamId,
        projectId: params.projectId,
        traceId: 'e5c0d1efb3904155472b01692c7f2d00',
      })
    ).rejects.toBe(error);
    expect(client.fetch).toHaveBeenCalledTimes(1);
  });

  it('resolves a request ID and maps the trace', async () => {
    const client = mockClient({
      traceId: 'trace_123',
      rootSpanId: 'span_root',
      spans: [
        {
          spanId: 'span_root',
          parentSpanId: null,
          name: 'GET /checkout',
          serviceName: 'vercel.proxy',
          timestamp: '2025-02-06T00:00:00.250Z',
          durationMs: 12.5,
          attributes: { 'http.method': 'GET', 'http.target': '/checkout' },
          status: { code: 'ERROR', message: 'failed' },
        },
      ],
      meta: { partial: true },
    });

    const result = await fetchTrace({ client, ...params });

    expect(result).toEqual({
      partial: true,
      trace: {
        traceId: 'trace_123',
        rootSpanId: 'span_root',
        spans: [
          {
            spanId: 'span_root',
            name: 'GET /checkout',
            serviceName: 'vercel.proxy',
            startTime: [1_738_800_000, 250_000_000],
            duration: [0, 12_500_000],
            attributes: {
              'http.method': 'GET',
              'http.target': '/checkout',
            },
            status: { code: 'Error', message: 'failed' },
          },
        ],
      },
    });
    expect(client.fetch).toHaveBeenCalledWith(
      'https://vercel.com/api/observability-api/v1/traces/requests/fra1%3A%3Aiad1%3A%3Areq-1738800000000-abc?teamId=team_123&projectId=prj_123',
      { headers: { 'x-vercel-observability-query-reason': 'cli/traces-get' } }
    );
  });

  it.each([
    [
      { code: 'ERROR', message: 'failed' },
      { code: 'Error', message: 'failed' },
    ],
    [{ code: 'OK' }, { code: 'Ok' }],
    [{ code: 'UNSET' }, { code: 'Unset' }],
    [undefined, { code: 'Unset' }],
  ])('maps API status %o to the status name traces search uses', async (status, expected) => {
    const client = mockClient({
      traceId: 'trace_123',
      spans: [
        {
          spanId: 'span_root',
          name: 'GET /checkout',
          timestamp: '2025-02-06T00:00:00.250Z',
          durationMs: 12.5,
          status,
        },
      ],
    });

    const { trace } = await fetchTrace({ client, ...params });

    expect(trace.spans[0].status).toEqual(expected);
  });

  it('surfaces Query Engine failures', async () => {
    const unavailable = Object.assign(new Error('unavailable'), {
      status: 502,
    });
    const client = mockClient(unavailable);

    await expect(fetchTrace({ client, ...params })).rejects.toThrow(
      'unavailable'
    );
    expect(client.fetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces a missing request trace', async () => {
    const missing = Object.assign(new Error('not found'), { status: 404 });
    const client = mockClient(missing);

    await expect(fetchTrace({ client, ...params })).rejects.toThrow(
      'not found'
    );
    expect(client.fetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces Query Engine authorization failures', async () => {
    const unauthorized = Object.assign(new Error('unauthorized'), {
      status: 401,
    });
    const client = mockClient(unauthorized);

    await expect(fetchTrace({ client, ...params })).rejects.toThrow(
      'unauthorized'
    );
    expect(client.fetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces invalid request ID failures', async () => {
    const invalid = Object.assign(new Error('invalid request ID'), {
      status: 400,
    });
    const client = mockClient(invalid);

    await expect(
      fetchTrace({ client, ...params, requestId: 'req_without_timestamp' })
    ).rejects.toThrow('invalid request ID');
    expect(client.fetch).toHaveBeenCalledTimes(1);
  });
});
