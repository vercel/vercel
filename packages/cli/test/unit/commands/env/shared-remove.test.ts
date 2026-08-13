import { describe, expect, it, beforeEach, vi } from 'vitest';
import env from '../../../../src/commands/env';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

const record = {
  id: 'env_1',
  key: 'API_URL',
  type: 'encrypted',
  target: ['production'],
  projectId: ['prj_a'],
};

function useResolve(data: unknown[] = [record]) {
  let query: Record<string, unknown> | undefined;
  client.scenario.get('/v1/env', (req, res) => {
    query = req.query;
    res.json({
      data,
      pagination: { count: data.length, next: null, prev: null },
    });
  });
  return () => query;
}

function useDelete() {
  let called = false;
  let body: Record<string, unknown> | undefined;
  client.scenario.delete('/v1/env', (req, res) => {
    called = true;
    body = req.body;
    res.json({ deleted: ['env_1'], failed: [] });
  });
  return { wasCalled: () => called, getBody: () => body };
}

describe('env shared remove', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('renders help and tracks telemetry', async () => {
      client.setArgv('env', 'shared', 'rm', '--help');
      const exitCode = await env(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:shared', value: 'shared' },
        { key: 'flag:help', value: 'env shared:rm' },
      ]);
    });
  });

  it('removes with --yes and sends the id', async () => {
    useResolve();
    const del = useDelete();
    client.setArgv('env', 'shared', 'rm', 'API_URL', '--yes');

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);
    expect(del.wasCalled()).toBe(true);
    expect(del.getBody()).toMatchObject({ ids: ['env_1'] });
    await expect(client.stderr).toOutput('Removed');
  });

  it('resolves an id via the ids filter', async () => {
    const getQuery = useResolve();
    useDelete();
    client.setArgv('env', 'shared', 'rm', 'env_1', '--yes');

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);
    expect(getQuery()).toMatchObject({ ids: 'env_1' });
  });

  it('cancels when the confirmation is declined and does not delete', async () => {
    useResolve();
    const del = useDelete();
    client.setArgv('env', 'shared', 'rm', 'API_URL');

    const exitCodePromise = env(client);
    await expect(client.stderr).toOutput('Remove Shared Environment Variable');
    client.stdin.write('n\n');

    await expect(client.stderr).toOutput('Canceled');
    expect(await exitCodePromise).toEqual(0);
    expect(del.wasCalled()).toBe(false);
  });

  it('emits confirmation_required and exits 1 in non-interactive mode', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    useResolve();
    const del = useDelete();
    client.nonInteractive = true;
    client.setArgv('env', 'shared', 'rm', 'API_URL', '--non-interactive');

    await expect(env(client)).rejects.toThrow('exit');
    expect(del.wasCalled()).toBe(false);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.reason).toEqual('confirmation_required');

    exitSpy.mockRestore();
  });

  it('errors when the variable is not found', async () => {
    useResolve([]);
    const del = useDelete();
    client.setArgv('env', 'shared', 'rm', 'MISSING', '--yes');

    const exitCode = await env(client);
    expect(exitCode).toEqual(1);
    expect(del.wasCalled()).toBe(false);
    await expect(client.stderr).toOutput(
      'No Shared Environment Variable MISSING found'
    );
  });

  it('tracks telemetry with a redacted argument', async () => {
    useResolve();
    useDelete();
    client.setArgv('env', 'shared', 'rm', 'API_URL', '--yes');
    await env(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:shared', value: 'shared' },
      { key: 'subcommand:rm', value: 'rm' },
      { key: 'argument:name-or-id', value: '[REDACTED]' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });
});
