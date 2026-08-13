import { describe, expect, it, beforeEach } from 'vitest';
import env from '../../../../src/commands/env';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

const SECRET = 'super-secret-value-do-not-print';

const sampleShared = {
  id: 'env_1',
  key: 'API_URL',
  type: 'encrypted',
  target: ['production', 'preview'],
  projectId: ['prj_a', 'prj_b'],
  comment: 'shared api url',
  createdAt: 1700000000000,
  updatedAt: 1700000500000,
  decrypted: true,
  // Prove the CLI never prints the value even if the API returns it.
  value: SECRET,
};

function useSharedEnv(data: unknown[] = [sampleShared]) {
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

describe('env shared inspect', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('renders help and tracks telemetry', async () => {
      client.setArgv('env', 'shared', 'inspect', '--help');
      const exitCode = await env(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:shared', value: 'shared' },
        { key: 'flag:help', value: 'env shared:inspect' },
      ]);
    });
  });

  it('inspects by name without exposing the value', async () => {
    useSharedEnv();
    client.setArgv('env', 'shared', 'inspect', 'API_URL');

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);

    const stdout = client.stdout.getFullOutput();
    const stderr = client.stderr.getFullOutput();
    expect(stdout).toContain('env_1');
    expect(stdout).toContain('production, preview');
    expect(stdout).not.toContain(SECRET);
    expect(stderr).not.toContain(SECRET);
  });

  it('tracks the inspect subcommand and redacts the argument', async () => {
    useSharedEnv();
    client.setArgv('env', 'shared', 'inspect', 'API_URL');
    await env(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:shared', value: 'shared' },
      { key: 'subcommand:inspect', value: 'inspect' },
      { key: 'argument:name-or-id', value: '[REDACTED]' },
    ]);
  });

  it('resolves an ID via the ids filter (never the get-by-id endpoint)', async () => {
    const getQuery = useSharedEnv();
    client.setArgv('env', 'shared', 'inspect', 'env_1');

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);
    expect(getQuery()).toMatchObject({ ids: 'env_1' });
  });

  it('emits clean JSON with --json and no value', async () => {
    useSharedEnv();
    client.setArgv('env', 'shared', 'inspect', 'API_URL', '--json');

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).not.toContain(SECRET);
    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({ id: 'env_1', key: 'API_URL' });
    expect(parsed).not.toHaveProperty('value');
  });

  it('errors when the variable is not found', async () => {
    useSharedEnv([]);
    client.setArgv('env', 'shared', 'inspect', 'MISSING');

    const exitCode = await env(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'No Shared Environment Variable MISSING found'
    );
  });

  it('errors when multiple variables share the name', async () => {
    useSharedEnv([
      { ...sampleShared, id: 'env_1', target: ['production'] },
      { ...sampleShared, id: 'env_2', target: ['preview'] },
    ]);
    client.setArgv('env', 'shared', 'inspect', 'API_URL');

    const exitCode = await env(client);
    expect(exitCode).toEqual(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Multiple Shared Environment Variables');
    expect(stderr).toContain('env_1');
    expect(stderr).toContain('env_2');
  });

  it('errors when no argument is provided', async () => {
    client.setArgv('env', 'shared', 'inspect');
    const exitCode = await env(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid number of arguments');
  });
});
