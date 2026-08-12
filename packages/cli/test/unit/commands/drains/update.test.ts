import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import drains from '../../../../src/commands/drains';
import { useUser } from '../../../mocks/user';
import { defaultDrain } from '../../../mocks/drains';
import type { UpdateDrainRequestBody } from '../../../../src/util/drains/types';

function useUpdatableDrain(drain = defaultDrain) {
  const recorder: { body?: UpdateDrainRequestBody } = {};
  client.scenario.get(`/v1/drains/${drain.id}`, (_req, res) => {
    res.json(drain);
  });
  client.scenario.patch(`/v1/drains/${drain.id}`, (req, res) => {
    recorder.body = req.body as UpdateDrainRequestBody;
    const { projects: _projects, ...rest } = recorder.body;
    res.json({ ...drain, ...rest });
  });
  return recorder;
}

describe('drains update', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('drains', 'update', '--help');
      const exitCodePromise = drains(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'drains:update',
        },
      ]);
    });
  });

  it('errors when no id is passed', async () => {
    client.setArgv('drains', 'update');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Please provide a drain id');
  });

  it('errors when no change flag is passed', async () => {
    client.setArgv('drains', 'update', 'drn_1');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Provide at least one flag to update');
  });

  it('renames a drain sending only the name', async () => {
    const recorder = useUpdatableDrain();
    client.setArgv('drains', 'update', 'drn_1', '--name', 'staging-logs');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    expect(recorder.body).toEqual({ name: 'staging-logs' });
    await expect(client.stderr).toOutput('updated');
  });

  it('merges a new endpoint into the full delivery object', async () => {
    const recorder = useUpdatableDrain();
    client.setArgv(
      'drains',
      'update',
      'drn_1',
      '--endpoint',
      'https://logs.example.com/v2'
    );
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    expect(recorder.body).toEqual({
      delivery: {
        type: 'http',
        endpoint: 'https://logs.example.com/v2',
        encoding: 'ndjson',
        headers: { Authorization: 'Bearer sk_do_not_leak' },
        secret: 'whsec_do_not_leak',
      },
    });

    const combined =
      client.stdout.getFullOutput() + client.stderr.getFullOutput();
    expect(combined).not.toContain('whsec_do_not_leak');
    expect(combined).not.toContain('sk_do_not_leak');
  });

  it('replaces the header set and secret when passed', async () => {
    const recorder = useUpdatableDrain();
    client.setArgv(
      'drains',
      'update',
      'drn_1',
      '--header',
      'X-New: value',
      '--secret',
      'whsec_new_no_leak'
    );
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    expect(recorder.body?.delivery).toEqual({
      type: 'http',
      endpoint: 'https://logs.example.com',
      encoding: 'ndjson',
      headers: { 'X-New': 'value' },
      secret: 'whsec_new_no_leak',
    });

    const combined =
      client.stdout.getFullOutput() + client.stderr.getFullOutput();
    expect(combined).not.toContain('whsec_new_no_leak');
    expect(combined).not.toContain('whsec_do_not_leak');
  });

  it('updates project scoping and sampling with the drain schema type', async () => {
    const recorder = useUpdatableDrain();
    client.setArgv(
      'drains',
      'update',
      'drn_1',
      '--project',
      'prj_9',
      '--sampling',
      '0.5',
      '--environment',
      'preview'
    );
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    expect(recorder.body).toEqual({
      projects: 'some',
      projectIds: ['prj_9'],
      sampling: [{ type: 'log', rate: 0.5, env: 'preview' }],
    });
  });

  it('rejects delivery updates for non-http drains', async () => {
    useUpdatableDrain({
      ...defaultDrain,
      id: 'drn_ch',
      delivery: {
        type: 'clickhouse',
        endpoint: 'https://ch.example.com',
        table: 'logs',
      },
    });
    client.setArgv(
      'drains',
      'update',
      'drn_ch',
      '--endpoint',
      'https://logs.example.com'
    );
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      "Can't update delivery settings of a clickhouse drain"
    );
  });

  it('still allows renaming a non-http drain', async () => {
    const recorder = useUpdatableDrain({
      ...defaultDrain,
      id: 'drn_ch',
      delivery: {
        type: 'clickhouse',
        endpoint: 'https://ch.example.com',
        table: 'logs',
      },
    });
    client.setArgv('drains', 'update', 'drn_ch', '--name', 'renamed');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);
    expect(recorder.body).toEqual({ name: 'renamed' });
  });

  it('outputs the updated drain as redacted JSON', async () => {
    useUpdatableDrain();
    client.setArgv('drains', 'update', 'drn_1', '--name', 'renamed', '--json');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).not.toContain('whsec_do_not_leak');
    expect(stdout).not.toContain('sk_do_not_leak');

    const parsed = JSON.parse(stdout);
    expect(parsed.name).toEqual('renamed');
    expect('secret' in parsed.delivery).toBe(false);
    expect(parsed.delivery.headers.Authorization).toBeNull();
  });

  it('rejects an invalid --encoding', async () => {
    client.setArgv('drains', 'update', 'drn_1', '--encoding', 'xml');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid --encoding value');
  });

  it('maps a 404 to a not-found message', async () => {
    client.scenario.get('/v1/drains/drn_missing', (_req, res) => {
      res.status(404).json({ error: { code: 'not_found', message: 'nope' } });
    });
    client.setArgv('drains', 'update', 'drn_missing', '--name', 'x');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Drain not found.');
  });
});
