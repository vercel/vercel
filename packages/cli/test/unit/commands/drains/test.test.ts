import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import drains from '../../../../src/commands/drains';
import { useUser } from '../../../mocks/user';
import { defaultDrain, useDrains, useTestDrain } from '../../../mocks/drains';

describe('drains test', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('drains', 'test', '--help');
      const exitCodePromise = drains(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'drains:test',
        },
      ]);
    });
  });

  it('errors when no id is passed', async () => {
    client.setArgv('drains', 'test');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Please provide a drain id');
  });

  it('sends the drain configuration to the validation endpoint', async () => {
    useDrains();
    const recorder = useTestDrain();
    client.setArgv('drains', 'test', 'drn_1');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    expect(recorder.body).toEqual({
      schemas: { log: { version: 'v1' } },
      delivery: {
        type: 'http',
        endpoint: 'https://logs.example.com',
        encoding: 'ndjson',
        headers: { Authorization: 'Bearer sk_do_not_leak' },
        secret: 'whsec_do_not_leak',
      },
    });

    await expect(client.stderr).toOutput('Test event delivered');

    const combined =
      client.stdout.getFullOutput() + client.stderr.getFullOutput();
    expect(combined).not.toContain('whsec_do_not_leak');
    expect(combined).not.toContain('sk_do_not_leak');
  });

  it('omits integration-managed placeholder secrets', async () => {
    useDrains([
      {
        ...defaultDrain,
        delivery: {
          ...defaultDrain.delivery,
          type: 'http',
          endpoint: 'https://logs.example.com',
          encoding: 'ndjson',
          headers: {},
          secret: { kind: 'INTEGRATION_SECRET' },
        },
      },
    ]);
    const recorder = useTestDrain();
    client.setArgv('drains', 'test', 'drn_1');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);
    expect(recorder.body?.delivery).not.toHaveProperty('secret');
  });

  it('reports a failed sample delivery and exits 1', async () => {
    useDrains();
    useTestDrain({
      status: 'error',
      error: 'connection refused',
      endpoint: 'https://logs.example.com',
    });
    client.setArgv('drains', 'test', 'drn_1');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Test delivery failed: connection refused'
    );
  });

  it('reports the result as JSON on success', async () => {
    useDrains();
    useTestDrain();
    client.setArgv('drains', 'test', 'drn_1', '--json');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed).toEqual({ id: 'drn_1', passed: true });
  });

  it('reports the result as JSON on failure and exits 1', async () => {
    useDrains();
    useTestDrain({
      status: 'error',
      error: 'connection refused',
      endpoint: 'https://logs.example.com',
    });
    client.setArgv('drains', 'test', 'drn_1', '--json');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).not.toContain('whsec_do_not_leak');
    expect(stdout).not.toContain('sk_do_not_leak');

    const parsed = JSON.parse(stdout);
    expect(parsed).toEqual({
      id: 'drn_1',
      passed: false,
      error: 'connection refused',
      endpoint: 'https://logs.example.com',
    });
  });

  it('rejects unsupported delivery types', async () => {
    useDrains([
      {
        ...defaultDrain,
        id: 'drn_ch',
        delivery: {
          type: 'clickhouse',
          endpoint: 'https://ch.example.com',
          table: 'logs',
        },
      },
    ]);
    client.setArgv('drains', 'test', 'drn_ch');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput("Can't test a clickhouse drain");
  });

  it('maps a 404 to a not-found message', async () => {
    client.scenario.get('/v1/drains/drn_missing', (_req, res) => {
      res.status(404).json({ error: { code: 'not_found', message: 'nope' } });
    });
    client.setArgv('drains', 'test', 'drn_missing');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Drain not found.');
  });
});
