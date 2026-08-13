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
  decrypted: false,
  // The list endpoint never returns a value; include one anyway to prove the
  // CLI never prints it.
  value: SECRET,
};

function useListSharedEnv(
  data: unknown[] = [sampleShared],
  pagination: { count: number; next: number | null; prev: number | null } = {
    count: 1,
    next: null,
    prev: null,
  }
) {
  let query: Record<string, unknown> | undefined;
  client.scenario.get('/v1/env', (req, res) => {
    query = req.query;
    res.json({ data, pagination });
  });
  return () => query;
}

describe('env shared ls', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('renders help and tracks telemetry', async () => {
      client.setArgv('env', 'shared', 'ls', '--help');
      const exitCode = await env(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:shared', value: 'shared' },
        { key: 'flag:help', value: 'env shared:ls' },
      ]);
    });
  });

  it('lists shared env vars in a table without exposing values', async () => {
    useListSharedEnv();
    client.setArgv('env', 'shared', 'ls');

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);

    const stdout = client.stdout.getFullOutput();
    const stderr = client.stderr.getFullOutput();
    expect(stdout).toContain('API_URL');
    expect(stdout).toContain('production, preview');
    expect(stdout).not.toContain(SECRET);
    expect(stderr).not.toContain(SECRET);
  });

  it('tracks the ls subcommand', async () => {
    useListSharedEnv();
    client.setArgv('env', 'shared', 'ls');
    await env(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:shared', value: 'shared' },
      { key: 'subcommand:ls', value: 'ls' },
    ]);
  });

  it('reports an empty state with exit 0', async () => {
    useListSharedEnv([], { count: 0, next: null, prev: null });
    client.setArgv('env', 'shared', 'ls');

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'No Shared Environment Variables found'
    );
  });

  it('emits clean JSON with --format json and no value', async () => {
    useListSharedEnv();
    client.setArgv('env', 'shared', 'ls', '--format', 'json');

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).not.toContain(SECRET);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('envs');
    expect(parsed.envs[0]).toMatchObject({
      id: 'env_1',
      key: 'API_URL',
      type: 'encrypted',
      projectCount: 2,
    });
    expect(parsed.envs[0]).not.toHaveProperty('value');
  });

  it('passes --project as a projectId filter', async () => {
    const getQuery = useListSharedEnv();
    client.setArgv('env', 'shared', 'ls', '--project', 'my-project');

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);
    expect(getQuery()).toMatchObject({ projectId: 'my-project' });

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:shared', value: 'shared' },
      { key: 'subcommand:ls', value: 'ls' },
      { key: 'option:project', value: '[REDACTED]' },
    ]);
  });

  it('passes --next as an until cursor', async () => {
    const getQuery = useListSharedEnv();
    client.setArgv('env', 'shared', 'ls', '--next', '1699999999999');

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);
    expect(getQuery()).toMatchObject({ until: '1699999999999' });
  });

  it('errors on unexpected arguments', async () => {
    client.setArgv('env', 'shared', 'ls', 'extra');
    const exitCode = await env(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid number of arguments');
  });

  it('errors on an invalid --format value', async () => {
    client.setArgv('env', 'shared', 'ls', '--format', 'yaml');
    const exitCode = await env(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid output format');
  });
});
