import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import drains from '../../../../src/commands/drains';
import { useUser } from '../../../mocks/user';
import { useCreateDrain } from '../../../mocks/drains';

describe('drains add', () => {
  beforeEach(() => {
    useUser();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('drains', 'add', '--help');
      const exitCodePromise = drains(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'drains:add',
        },
      ]);
    });
  });

  it('errors listing all missing required flags in non-interactive mode', async () => {
    client.nonInteractive = true;
    client.setArgv('drains', 'add', '--name', 'my-drain');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Missing required flags: --type, --endpoint'
    );
  });

  it('creates an HTTP drain with the full flag surface', async () => {
    const recorder = useCreateDrain();
    client.setArgv(
      'drains',
      'add',
      '--name',
      'prod-logs',
      '--type',
      'log',
      '--endpoint',
      'https://logs.example.com/ingest',
      '--encoding',
      'ndjson',
      '--compression',
      'gzip',
      '--header',
      'Authorization: Bearer sk_add_no_leak',
      '--header',
      'X-Env: prod',
      '--secret',
      'whsec_add_no_leak',
      '--project',
      'prj_1',
      '--project',
      'prj_2',
      '--sampling',
      '0.25',
      '--environment',
      'production'
    );
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    expect(recorder.body).toEqual({
      name: 'prod-logs',
      projects: 'some',
      projectIds: ['prj_1', 'prj_2'],
      schemas: { log: { version: 'v1' } },
      delivery: {
        type: 'http',
        endpoint: 'https://logs.example.com/ingest',
        encoding: 'ndjson',
        compression: 'gzip',
        headers: {
          Authorization: 'Bearer sk_add_no_leak',
          'X-Env': 'prod',
        },
        secret: 'whsec_add_no_leak',
      },
      sampling: [{ type: 'log', rate: 0.25, env: 'production' }],
    });

    await expect(client.stderr).toOutput('created');

    const combined =
      client.stdout.getFullOutput() + client.stderr.getFullOutput();
    expect(combined).toContain('drn_new');
    expect(combined).not.toContain('whsec_add_no_leak');
    expect(combined).not.toContain('sk_add_no_leak');
  });

  it('defaults to json encoding and all projects', async () => {
    const recorder = useCreateDrain();
    client.setArgv(
      'drains',
      'add',
      '--name',
      'minimal',
      '--type',
      'trace',
      '--endpoint',
      'https://traces.example.com'
    );
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    expect(recorder.body).toEqual({
      name: 'minimal',
      projects: 'all',
      schemas: { trace: { version: 'v1' } },
      delivery: {
        type: 'http',
        endpoint: 'https://traces.example.com',
        encoding: 'json',
        headers: {},
      },
    });
  });

  it('outputs the created drain as redacted JSON', async () => {
    useCreateDrain();
    client.setArgv(
      'drains',
      'add',
      '--name',
      'prod-logs',
      '--type',
      'log',
      '--endpoint',
      'https://logs.example.com/ingest',
      '--header',
      'Authorization: Bearer sk_add_no_leak',
      '--secret',
      'whsec_add_no_leak',
      '--json'
    );
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).not.toContain('whsec_add_no_leak');
    expect(stdout).not.toContain('sk_add_no_leak');

    const parsed = JSON.parse(stdout);
    expect(parsed.id).toEqual('drn_new');
    expect(parsed.name).toEqual('prod-logs');
    expect('secret' in parsed.delivery).toBe(false);
    expect(parsed.delivery.headers.Authorization).toBeNull();
  });

  it('prompts for missing required values in TTY mode', async () => {
    const recorder = useCreateDrain();
    client.input.text = vi
      .fn()
      .mockResolvedValueOnce('prompted-drain')
      .mockResolvedValueOnce('https://logs.example.com');
    client.input.select = vi.fn().mockResolvedValue('log');

    client.setArgv('drains', 'add');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    expect(client.input.text).toHaveBeenCalledTimes(2);
    expect(client.input.select).toHaveBeenCalledTimes(1);
    expect(recorder.body?.name).toEqual('prompted-drain');
    expect(recorder.body?.schemas).toEqual({ log: { version: 'v1' } });
    expect(recorder.body?.delivery.endpoint).toEqual(
      'https://logs.example.com'
    );
  });

  it('rejects an invalid --type', async () => {
    client.setArgv(
      'drains',
      'add',
      '--name',
      'x',
      '--type',
      'metrics',
      '--endpoint',
      'https://logs.example.com'
    );
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid --type value');
  });

  it('rejects an invalid --endpoint', async () => {
    client.setArgv(
      'drains',
      'add',
      '--name',
      'x',
      '--type',
      'log',
      '--endpoint',
      'not-a-url'
    );
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('must be a valid HTTP(S) URL');
  });

  it('rejects an out-of-range --sampling', async () => {
    client.setArgv(
      'drains',
      'add',
      '--name',
      'x',
      '--type',
      'log',
      '--endpoint',
      'https://logs.example.com',
      '--sampling',
      '1.5'
    );
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('between 0 and 1');
  });

  it('rejects --environment without --sampling', async () => {
    client.setArgv(
      'drains',
      'add',
      '--name',
      'x',
      '--type',
      'log',
      '--endpoint',
      'https://logs.example.com',
      '--environment',
      'production'
    );
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'The --environment flag requires --sampling.'
    );
  });

  it('rejects a malformed --header', async () => {
    client.setArgv(
      'drains',
      'add',
      '--name',
      'x',
      '--type',
      'log',
      '--endpoint',
      'https://logs.example.com',
      '--header',
      'no-colon-here'
    );
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(`Couldn't parse header`);
  });

  it('surfaces the plan/permission error on 403', async () => {
    client.scenario.post('/v1/drains', (_req, res) => {
      res.status(403).json({
        error: {
          code: 'forbidden',
          message: 'Drains are not available for this team.',
        },
      });
    });
    client.setArgv(
      'drains',
      'add',
      '--name',
      'x',
      '--type',
      'log',
      '--endpoint',
      'https://logs.example.com'
    );
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Drains are not available for this team.'
    );
  });

  it('maps a 400 validation error', async () => {
    client.scenario.post('/v1/drains', (_req, res) => {
      res.status(400).json({
        error: {
          code: 'bad_request',
          message: 'A drain with this name already exists.',
        },
      });
    });
    client.setArgv(
      'drains',
      'add',
      '--name',
      'x',
      '--type',
      'log',
      '--endpoint',
      'https://logs.example.com'
    );
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'A drain with this name already exists.'
    );
  });
});
