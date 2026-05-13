import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import {
  fetchTrace,
  TimeoutError,
} from '../../../../src/commands/traces/fetch-trace';
import { isAPIError } from '../../../../src/util/errors-ts';
import type { Trace } from '../../../../src/commands/traces/types';

const sampleTrace: Trace = {
  traceId: 'trace_abc',
  rootSpanId: 'span_root',
  spans: [
    {
      spanId: 'span_root',
      name: 'GET /api/hello',
      duration: [0, 25_000_000],
      attributes: { 'http.status_code': 200 },
      status: { code: 0 },
    },
  ],
};

function baseParams() {
  return {
    client,
    teamId: 'team_dummy',
    projectId: 'prj_test',
    requestId: 'req_abc',
    // Generous default budget — individual tests override when needed.
    timeoutMs: 30_000,
    retry: true,
  };
}

describe('fetchTrace', () => {
  beforeEach(() => {
    client.reset();
  });

  it('returns the trace immediately on a 200 response', async () => {
    let calls = 0;
    client.scenario.get('/api/v1/projects/traces', (_req, res) => {
      calls += 1;
      res.json({ trace: sampleTrace });
    });

    const result = await fetchTrace(baseParams());

    expect(calls).toBe(1);
    expect(result).toEqual({ trace: sampleTrace });
  });

  it('retries on 404 until a 200 response arrives', async () => {
    let calls = 0;
    client.scenario.get('/api/v1/projects/traces', (_req, res) => {
      calls += 1;
      if (calls < 3) {
        res.status(404).json({ error: { message: 'not found' } });
        return;
      }
      res.json({ trace: sampleTrace });
    });

    const result = await fetchTrace(baseParams());

    expect(calls).toBe(3);
    expect(result).toEqual({ trace: sampleTrace });
  });

  it('retries on 5xx responses', async () => {
    let calls = 0;
    client.scenario.get('/api/v1/projects/traces', (_req, res) => {
      calls += 1;
      if (calls < 2) {
        res.status(503).json({ error: { message: 'transient' } });
        return;
      }
      res.json({ trace: sampleTrace });
    });

    const result = await fetchTrace(baseParams());

    expect(calls).toBe(2);
    expect(result).toEqual({ trace: sampleTrace });
  });

  it('returns TimeoutError when the budget is exhausted', async () => {
    let calls = 0;
    client.scenario.get('/api/v1/projects/traces', (_req, res) => {
      calls += 1;
      res.status(404).json({ error: { message: 'not found' } });
    });

    // 100ms budget — the first 500ms backoff already overshoots, so the fetcher
    // bails after a single attempt without sleeping.
    const result = await fetchTrace({ ...baseParams(), timeoutMs: 100 });

    expect(result).toBeInstanceOf(TimeoutError);
    if (result instanceof TimeoutError) {
      expect(result.requestId).toBe('req_abc');
      expect(result.timeoutMs).toBe(100);
    }
    expect(calls).toBe(1);
  });

  it('does not retry on 401 — returns the error immediately', async () => {
    let calls = 0;
    client.scenario.get('/api/v1/projects/traces', (_req, res) => {
      calls += 1;
      res.status(401).json({ error: { message: 'unauthorized' } });
    });

    const result = await fetchTrace(baseParams());

    expect(calls).toBe(1);
    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBeInstanceOf(TimeoutError);
    expect(isAPIError(result)).toBe(true);
    if (isAPIError(result)) {
      expect(result.status).toBe(401);
    }
  });

  it('does not retry on 403 — returns the error immediately', async () => {
    let calls = 0;
    client.scenario.get('/api/v1/projects/traces', (_req, res) => {
      calls += 1;
      res.status(403).json({ error: { message: 'forbidden' } });
    });

    const result = await fetchTrace(baseParams());

    expect(calls).toBe(1);
    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBeInstanceOf(TimeoutError);
    expect(isAPIError(result)).toBe(true);
    if (isAPIError(result)) {
      expect(result.status).toBe(403);
    }
  });

  it('with retry: false, makes a single attempt regardless of 404', async () => {
    let calls = 0;
    client.scenario.get('/api/v1/projects/traces', (_req, res) => {
      calls += 1;
      res.status(404).json({ error: { message: 'not found' } });
    });

    const result = await fetchTrace({ ...baseParams(), retry: false });

    expect(calls).toBe(1);
    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBeInstanceOf(TimeoutError);
    expect(isAPIError(result)).toBe(true);
    if (isAPIError(result)) {
      expect(result.status).toBe(404);
    }
  });

  it('with retry: false, returns the trace on 200', async () => {
    let calls = 0;
    client.scenario.get('/api/v1/projects/traces', (_req, res) => {
      calls += 1;
      res.json({ trace: sampleTrace });
    });

    const result = await fetchTrace({ ...baseParams(), retry: false });

    expect(calls).toBe(1);
    expect(result).toEqual({ trace: sampleTrace });
  });

  it('passes teamId, projectId, requestId in the query string', async () => {
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/api/v1/projects/traces', (req, res) => {
      receivedQuery = req.query as Record<string, unknown>;
      res.json({ trace: sampleTrace });
    });

    await fetchTrace(baseParams());

    expect(receivedQuery).toEqual({
      teamId: 'team_dummy',
      projectId: 'prj_test',
      requestId: 'req_abc',
    });
  });
});
