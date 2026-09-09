import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import sandbox from '../../../../src/commands/sandbox';

const run = vi.fn<(args: string[]) => Promise<void>>();

vi.mock('sandbox', () => ({
  createApp: vi.fn(() => ({ run })),
}));

describe('sandbox', () => {
  let invocationIdSeenByChild: string | undefined;

  beforeEach(() => {
    invocationIdSeenByChild = undefined;
    run.mockImplementation(async () => {
      invocationIdSeenByChild = process.env.VERCEL_CLI_INVOCATION_ID;
    });
  });

  afterEach(() => {
    run.mockReset();
    delete process.env.VERCEL_CLI_INVOCATION_ID;
  });

  it('passes the invocation id to the sandbox CLI and restores the env afterwards', async () => {
    client.setArgv('sandbox', 'list');

    const exitCode = await sandbox(client);

    expect(exitCode).toEqual(0);
    expect(run).toHaveBeenCalledWith(['list']);
    expect(invocationIdSeenByChild).toEqual(
      client.telemetryEventStore.currentInvocationId
    );
    expect(process.env.VERCEL_CLI_INVOCATION_ID).toBeUndefined();
  });

  it('restores a pre-existing VERCEL_CLI_INVOCATION_ID after the sandbox CLI exits', async () => {
    process.env.VERCEL_CLI_INVOCATION_ID = 'outer-invocation';
    client.setArgv('sandbox', 'list');

    await sandbox(client);

    expect(invocationIdSeenByChild).toEqual(
      client.telemetryEventStore.currentInvocationId
    );
    expect(process.env.VERCEL_CLI_INVOCATION_ID).toEqual('outer-invocation');
  });

  it('restores the env when the sandbox CLI throws', async () => {
    run.mockRejectedValueOnce(new Error('boom'));
    client.setArgv('sandbox', 'list');

    const exitCode = await sandbox(client);

    expect(exitCode).toEqual(1);
    expect(process.env.VERCEL_CLI_INVOCATION_ID).toBeUndefined();
  });
});
