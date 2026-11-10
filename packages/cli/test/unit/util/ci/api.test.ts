import { ReadableStream } from 'node:stream/web';
import { describe, expect, it, vi } from 'vitest';
import type Client from '../../../../src/util/client';
import {
  getCiTaskRunLogs,
  type CiTaskRunLocator,
} from '../../../../src/util/ci/api';

const locator: CiTaskRunLocator = {
  invocationId: 'invo1_test',
  attempt: 2,
  jobDefinitionId: 'jobd1_test',
  jobRunAttempt: 3,
  taskDefinitionId: 'tskd1_test',
  taskRunAttempt: 4,
};

function mockClient(response: Response) {
  const fetch = vi.fn().mockResolvedValue(response);
  return { client: { fetch } as unknown as Client, fetch };
}

describe('getCiTaskRunLogs', () => {
  it('reads a bounded full snapshot without follow or since and preserves the exact attempt and filters', async () => {
    const snapshot = {
      lines: [{ level: 'info', timestamp: 1, message: 'full snapshot' }],
    };
    const { client, fetch } = mockClient(
      new Response(JSON.stringify(snapshot, null, 2), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    );
    expect(
      await getCiTaskRunLogs(
        client,
        { ...locator, taskDefinitionId: 'task/with?separators' },
        {
          accountId: 'team_test',
          levels: ['error', 'warn'],
        }
      )
    ).toEqual(snapshot);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      '/v1/vercel-ci/invocations/invo1_test/attempts/2/job-definitions/jobd1_test/runs/3/task-definitions/task%2Fwith%3Fseparators/runs/4/logs?level=error&level=warn',
      { json: false, accountId: 'team_test', signal: undefined }
    );
  });

  it('rejects oversized snapshots before parsing or returning their records', async () => {
    const { client, fetch } = mockClient(
      new Response(
        JSON.stringify({
          lines: [
            {
              level: 'info',
              timestamp: 1,
              message: 'x'.repeat(8 * 1024 * 1024),
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } }
      )
    );
    await expect(getCiTaskRunLogs(client, locator)).rejects.toThrow(
      'exceeds 8 MiB'
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('cancels an unexpected NDJSON log response even if the server leaves it open', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            '{"level":"info","timestamp":1,"message":"not a snapshot"}\n'
          )
        );
      },
      cancel,
    });
    const { client } = mockClient(
      new Response(body, {
        headers: { 'content-type': 'application/stream+json' },
      })
    );
    await expect(getCiTaskRunLogs(client, locator)).rejects.toThrow(
      'Invalid Vercel CI log snapshot.'
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects multiple snapshot envelopes instead of accepting a partial result', async () => {
    const { client } = mockClient(
      new Response('{"lines":[]}\n{"lines":[]}\n', {
        headers: { 'content-type': 'application/stream+json' },
      })
    );
    await expect(getCiTaskRunLogs(client, locator)).rejects.toThrow(
      'Invalid Vercel CI log snapshot.'
    );
  });

  it('rejects an empty response instead of claiming completion', async () => {
    const { client } = mockClient(new Response(''));
    await expect(getCiTaskRunLogs(client, locator)).rejects.toThrow(
      'Missing Vercel CI log snapshot.'
    );
  });
});
