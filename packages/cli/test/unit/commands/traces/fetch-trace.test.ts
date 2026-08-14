import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { fetchTrace } from '../../../../src/commands/traces/fetch-trace';
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
  };
}

describe('fetchTrace', () => {
  beforeEach(() => {
    client.reset();
  });

  it('returns the trace on a 200 response', async () => {
    let calls = 0;
    client.scenario.get('/v1/projects/traces', (_req, res) => {
      calls += 1;
      res.json({ trace: sampleTrace });
    });

    const result = await fetchTrace(baseParams());

    expect(calls).toBe(1);
    expect(result).toEqual({ trace: sampleTrace });
  });

  it('passes teamId, projectId, requestId in the query string', async () => {
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/v1/projects/traces', (req, res) => {
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

  it('propagates 404 without retrying (built-in retry bails on 4xx)', async () => {
    let calls = 0;
    client.scenario.get('/v1/projects/traces', (_req, res) => {
      calls += 1;
      res.status(404).json({ error: { message: 'not found' } });
    });

    await expect(fetchTrace(baseParams())).rejects.toMatchObject({
      status: 404,
    });
    expect(calls).toBe(1);
  });

  it('propagates 401 without retrying', async () => {
    let calls = 0;
    client.scenario.get('/v1/projects/traces', (_req, res) => {
      calls += 1;
      res.status(401).json({ error: { message: 'unauthorized' } });
    });

    const err = await fetchTrace(baseParams()).catch(e => e);
    expect(isAPIError(err)).toBe(true);
    expect(err.status).toBe(401);
    expect(calls).toBe(1);
  });
});
