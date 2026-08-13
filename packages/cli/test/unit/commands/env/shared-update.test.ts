import { describe, expect, it, beforeEach } from 'vitest';
import env from '../../../../src/commands/env';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

const SECRET = 'super-secret-new-value';

const record = {
  id: 'env_1',
  key: 'API_URL',
  type: 'encrypted',
  target: ['production'],
  projectId: ['prj_a'],
  createdAt: 1700000000000,
  updatedAt: 1700000500000,
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

function usePatch() {
  let body: Record<string, unknown> | undefined;
  let called = false;
  client.scenario.patch('/v1/env', (req, res) => {
    called = true;
    body = req.body;
    res.json({ updated: [record], failed: [] });
  });
  return { getBody: () => body, wasCalled: () => called };
}

describe('env shared update', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('renders help and tracks telemetry', async () => {
      client.setArgv('env', 'shared', 'update', '--help');
      const exitCode = await env(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:shared', value: 'shared' },
        { key: 'flag:help', value: 'env shared:update' },
      ]);
    });
  });

  it('updates the value and never prints it', async () => {
    useResolve();
    const patch = usePatch();
    client.setArgv('env', 'shared', 'update', 'API_URL', SECRET, '--yes');

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);

    expect(patch.wasCalled()).toBe(true);
    const body = patch.getBody() as {
      updates: Record<string, { value?: string }>;
    };
    expect(body.updates.env_1.value).toEqual(SECRET);

    const stdout = client.stdout.getFullOutput();
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Updated');
    expect(stdout).not.toContain(SECRET);
    expect(stderr).not.toContain(SECRET);
  });

  it('ingests the new value from piped stdin and strips the trailing newline', async () => {
    useResolve();
    const patch = usePatch();
    client.stdin.isTTY = false;
    client.setArgv('env', 'shared', 'update', 'API_URL', '--yes');

    const exitCodePromise = env(client);
    setImmediate(() => client.stdin.emit('data', `${SECRET}\n`));

    expect(await exitCodePromise).toEqual(0);
    expect(patch.wasCalled()).toBe(true);
    const body = patch.getBody() as {
      updates: Record<string, { value?: string }>;
    };
    expect(body.updates.env_1.value).toEqual(SECRET);

    const stdout = client.stdout.getFullOutput();
    const stderr = client.stderr.getFullOutput();
    expect(stdout).not.toContain(SECRET);
    expect(stderr).not.toContain(SECRET);
  });

  it('resolves an id via the ids filter', async () => {
    const getQuery = useResolve();
    usePatch();
    client.setArgv('env', 'shared', 'update', 'env_1', '--sensitive', '--yes');

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);
    expect(getQuery()).toMatchObject({ ids: 'env_1' });
  });

  it('sends projectIdUpdates for link and unlink', async () => {
    useResolve();
    const patch = usePatch();
    client.setArgv(
      'env',
      'shared',
      'update',
      'API_URL',
      '--link-project',
      'prj_b',
      '--unlink-project',
      'prj_a',
      '--yes'
    );

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);
    const body = patch.getBody() as {
      updates: Record<
        string,
        { projectIdUpdates?: { link?: string[]; unlink?: string[] } }
      >;
    };
    expect(body.updates.env_1.projectIdUpdates).toEqual({
      link: ['prj_b'],
      unlink: ['prj_a'],
    });
  });

  it('marks the variable sensitive', async () => {
    useResolve();
    const patch = usePatch();
    client.setArgv(
      'env',
      'shared',
      'update',
      'API_URL',
      '--sensitive',
      '--yes'
    );

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);
    const body = patch.getBody() as {
      updates: Record<string, { type?: string }>;
    };
    expect(body.updates.env_1.type).toEqual('sensitive');
  });

  it('errors when nothing is provided to update', async () => {
    const patch = usePatch();
    client.setArgv('env', 'shared', 'update', 'API_URL', '--yes');

    const exitCode = await env(client);
    expect(exitCode).toEqual(1);
    expect(patch.wasCalled()).toBe(false);
    await expect(client.stderr).toOutput('Nothing to update');
  });

  it('errors when the variable is not found', async () => {
    useResolve([]);
    const patch = usePatch();
    client.setArgv('env', 'shared', 'update', 'MISSING', SECRET, '--yes');

    const exitCode = await env(client);
    expect(exitCode).toEqual(1);
    expect(patch.wasCalled()).toBe(false);
    await expect(client.stderr).toOutput(
      'No Shared Environment Variable MISSING found'
    );
  });

  it('errors when multiple variables share the name', async () => {
    useResolve([
      { ...record, id: 'env_1' },
      { ...record, id: 'env_2' },
    ]);
    const patch = usePatch();
    client.setArgv('env', 'shared', 'update', 'API_URL', SECRET, '--yes');

    const exitCode = await env(client);
    expect(exitCode).toEqual(1);
    expect(patch.wasCalled()).toBe(false);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Multiple Shared Environment Variables');
  });

  it('tracks telemetry with redacted argument and value', async () => {
    useResolve();
    usePatch();
    client.setArgv('env', 'shared', 'update', 'API_URL', SECRET, '--yes');
    await env(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:shared', value: 'shared' },
      { key: 'subcommand:update', value: 'update' },
      { key: 'argument:name-or-id', value: '[REDACTED]' },
      { key: 'argument:value', value: '[REDACTED]' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });
});
