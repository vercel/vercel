import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDeploymentCheckRunLogs } from '../../../../src/util/deploy/get-deployment-check-run-logs';

function ndjson(...entries: Record<string, unknown>[]): string {
  return entries.map(e => JSON.stringify(e)).join('\n') + '\n';
}

function createMockClient(responses: string[]) {
  let callCount = 0;
  return {
    fetch: vi.fn(async () => ({
      text: async () => responses[Math.min(callCount++, responses.length - 1)],
    })),
  } as any;
}

describe('getDeploymentCheckRunLogs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should parse NDJSON logs and filter out eof and debug entries', async () => {
    const body = ndjson(
      { level: 'debug', timestamp: 1000, message: 'Provisioning sandbox...' },
      { level: 'command', timestamp: 2000, message: 'npm run lint' },
      { level: 'info', timestamp: 3000, message: '> eslint .' },
      { level: 'error', timestamp: 4000, message: 'Exited with code 1.' },
      { level: 'eof', timestamp: 5000, message: '' }
    );
    const client = createMockClient([body]);

    const promise = getDeploymentCheckRunLogs(client, 'dpl_123', 'ckr_456');
    await vi.advanceTimersByTimeAsync(1000);
    const logs = await promise;

    expect(logs).toEqual([
      { level: 'command', timestamp: 2000, message: 'npm run lint' },
      { level: 'info', timestamp: 3000, message: '> eslint .' },
      { level: 'error', timestamp: 4000, message: 'Exited with code 1.' },
    ]);
    expect(client.fetch).toHaveBeenCalledTimes(1);
  });

  it('should poll until eof is present', async () => {
    const partialBody = ndjson({
      level: 'command',
      timestamp: 2000,
      message: 'npm run lint',
    });
    const fullBody = ndjson(
      { level: 'command', timestamp: 2000, message: 'npm run lint' },
      { level: 'error', timestamp: 3000, message: 'Exited with code 1.' },
      { level: 'eof', timestamp: 4000, message: '' }
    );
    const client = createMockClient([partialBody, fullBody]);

    const promise = getDeploymentCheckRunLogs(client, 'dpl_123', 'ckr_456');
    // initial 1s delay
    await vi.advanceTimersByTimeAsync(1000);
    // first attempt returns no eof, wait 2s poll interval
    await vi.advanceTimersByTimeAsync(2000);
    const logs = await promise;

    expect(logs).toEqual([
      { level: 'command', timestamp: 2000, message: 'npm run lint' },
      { level: 'error', timestamp: 3000, message: 'Exited with code 1.' },
    ]);
    expect(client.fetch).toHaveBeenCalledTimes(2);
  });

  it('should return empty array after exhausting all attempts without eof', async () => {
    const noEof = ndjson({
      level: 'command',
      timestamp: 2000,
      message: 'npm run lint',
    });
    const client = createMockClient([noEof]);

    const promise = getDeploymentCheckRunLogs(client, 'dpl_123', 'ckr_456');
    // initial 1s + 5 attempts with 2s intervals between retries
    for (let i = 0; i < 12; i++) {
      await vi.advanceTimersByTimeAsync(2000);
    }
    const logs = await promise;

    expect(logs).toEqual([]);
    expect(client.fetch).toHaveBeenCalledTimes(5);
  });

  it('should skip malformed NDJSON lines', async () => {
    const body = [
      JSON.stringify({
        level: 'command',
        timestamp: 1000,
        message: 'npm run lint',
      }),
      'not valid json {{{',
      JSON.stringify({ level: 'eof', timestamp: 2000, message: '' }),
    ].join('\n');
    const client = createMockClient([body]);

    const promise = getDeploymentCheckRunLogs(client, 'dpl_123', 'ckr_456');
    await vi.advanceTimersByTimeAsync(1000);
    const logs = await promise;

    expect(logs).toEqual([
      { level: 'command', timestamp: 1000, message: 'npm run lint' },
    ]);
  });

  it('should encode deployment and check run IDs in the URL', async () => {
    const body = ndjson({ level: 'eof', timestamp: 1000, message: '' });
    const client = createMockClient([body]);

    const promise = getDeploymentCheckRunLogs(
      client,
      'dpl_abc/123',
      'ckr_def/456'
    );
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(client.fetch).toHaveBeenCalledWith(
      '/v2/deployments/dpl_abc%2F123/check-runs/ckr_def%2F456/logs',
      { json: false }
    );
  });
});
