import { describe, expect, it, beforeEach } from 'vitest';
import env from '../../../../src/commands/env';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

const SECRET = 'super-secret-value-do-not-print';

function useCreateSharedEnv(
  created: unknown[] = [{ id: 'env_new', key: 'API_URL' }]
) {
  let body: Record<string, unknown> | undefined;
  let called = false;
  client.scenario.post('/v1/env', (req, res) => {
    called = true;
    body = req.body;
    res.status(201).json({ created, failed: [] });
  });
  return {
    getBody: () => body,
    wasCalled: () => called,
  };
}

describe('env shared add', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('renders help and tracks telemetry', async () => {
      client.setArgv('env', 'shared', 'add', '--help');
      const exitCode = await env(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:shared', value: 'shared' },
        { key: 'flag:help', value: 'env shared:add' },
      ]);
    });
  });

  it('adds a variable and never prints the value', async () => {
    const mock = useCreateSharedEnv();
    client.setArgv(
      'env',
      'shared',
      'add',
      'API_URL',
      SECRET,
      '-e',
      'production',
      '-e',
      'preview',
      '--yes'
    );

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);

    expect(mock.wasCalled()).toBe(true);
    const body = mock.getBody() as {
      evs: { key: string; value: string }[];
      target: string[];
      type: string;
    };
    expect(body.evs[0].key).toEqual('API_URL');
    expect(body.evs[0].value).toEqual(SECRET);
    expect(body.target).toEqual(['production', 'preview']);
    expect(body.type).toEqual('encrypted');

    const stdout = client.stdout.getFullOutput();
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Added');
    expect(stdout).not.toContain(SECRET);
    expect(stderr).not.toContain(SECRET);
  });

  it('ingests the value from piped stdin and strips the trailing newline', async () => {
    const mock = useCreateSharedEnv();
    client.stdin.isTTY = false;
    client.setArgv(
      'env',
      'shared',
      'add',
      'API_URL',
      '-e',
      'production',
      '--yes'
    );

    const exitCodePromise = env(client);
    setImmediate(() => client.stdin.emit('data', `${SECRET}\n`));

    expect(await exitCodePromise).toEqual(0);
    expect(mock.wasCalled()).toBe(true);
    const body = mock.getBody() as { evs: { key: string; value: string }[] };
    expect(body.evs[0].value).toEqual(SECRET);

    const stdout = client.stdout.getFullOutput();
    const stderr = client.stderr.getFullOutput();
    expect(stdout).not.toContain(SECRET);
    expect(stderr).not.toContain(SECRET);
  });

  it('marks the variable sensitive with --sensitive and stores a comment', async () => {
    const mock = useCreateSharedEnv();
    client.setArgv(
      'env',
      'shared',
      'add',
      'TOKEN',
      SECRET,
      '-e',
      'production',
      '--sensitive',
      '--comment',
      'prod token',
      '--yes'
    );

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);
    const body = mock.getBody() as {
      type: string;
      evs: { comment?: string }[];
    };
    expect(body.type).toEqual('sensitive');
    expect(body.evs[0].comment).toEqual('prod token');
  });

  it('tracks telemetry with redacted name/value and enum environments', async () => {
    useCreateSharedEnv();
    client.setArgv(
      'env',
      'shared',
      'add',
      'API_URL',
      SECRET,
      '-e',
      'production',
      '--yes'
    );
    await env(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:shared', value: 'shared' },
      { key: 'subcommand:add', value: 'add' },
      { key: 'argument:name', value: '[REDACTED]' },
      { key: 'argument:value', value: '[REDACTED]' },
      { key: 'option:environment', value: 'production' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });

  it('errors in non-interactive mode when the value is missing', async () => {
    const mock = useCreateSharedEnv();
    client.nonInteractive = true;
    client.setArgv('env', 'shared', 'add', 'API_URL', '-e', 'production');

    const exitCode = await env(client);
    expect(exitCode).toEqual(1);
    expect(mock.wasCalled()).toBe(false);
    await expect(client.stderr).toOutput('Provide a value');
  });

  it('errors in non-interactive mode when no environment is provided', async () => {
    const mock = useCreateSharedEnv();
    client.nonInteractive = true;
    client.setArgv('env', 'shared', 'add', 'API_URL', SECRET);

    const exitCode = await env(client);
    expect(exitCode).toEqual(1);
    expect(mock.wasCalled()).toBe(false);
    await expect(client.stderr).toOutput('at least one environment');
  });

  it('rejects an invalid environment', async () => {
    const mock = useCreateSharedEnv();
    client.setArgv(
      'env',
      'shared',
      'add',
      'API_URL',
      SECRET,
      '-e',
      'staging',
      '--yes'
    );

    const exitCode = await env(client);
    expect(exitCode).toEqual(1);
    expect(mock.wasCalled()).toBe(false);
    await expect(client.stderr).toOutput('Invalid environment');
  });

  it('reports a failed creation', async () => {
    client.scenario.post('/v1/env', (_req, res) => {
      res.status(400).json({
        created: [],
        failed: [{ code: 'bad_request', message: 'Variable already exists' }],
      });
    });
    client.setArgv(
      'env',
      'shared',
      'add',
      'API_URL',
      SECRET,
      '-e',
      'production',
      '--yes'
    );

    const exitCode = await env(client);
    expect(exitCode).toEqual(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).not.toContain(SECRET);
  });
});
