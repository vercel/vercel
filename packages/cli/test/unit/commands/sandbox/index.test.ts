import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'sandbox';
import { client } from '../../../mocks/client';
import sandbox from '../../../../src/commands/sandbox';

vi.mock('sandbox', () => ({
  createApp: vi.fn(),
}));

describe('sandbox invocation telemetry', () => {
  afterEach(() => {
    vi.mocked(createApp).mockReset();
    vi.unstubAllEnvs();
  });

  it('passes the current invocation id to sandbox', async () => {
    vi.stubEnv('VERCEL_CLI_INVOCATION_ID', undefined);
    client.setArgv('sandbox', 'list');
    const invocationId = client.telemetryEventStore.currentInvocationId;
    expect(invocationId).toEqual(expect.any(String));
    expect(invocationId).not.toBe('');
    const run = vi.fn(async () => {
      expect(process.env.VERCEL_CLI_INVOCATION_ID).toBe(invocationId);
    });
    vi.mocked(createApp).mockImplementation(() => {
      expect(process.env.VERCEL_CLI_INVOCATION_ID).toBe(invocationId);
      return { run };
    });

    expect(await sandbox(client)).toBe(0);
    expect(run).toHaveBeenCalledWith(['list']);
  });
});
