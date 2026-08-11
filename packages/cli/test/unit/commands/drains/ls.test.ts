import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import drains from '../../../../src/commands/drains';
import { useUser } from '../../../mocks/user';
import { useDrains, defaultDrain } from '../../../mocks/drains';

describe('drains ls', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('drains', 'ls', '--help');
      const exitCodePromise = drains(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'drains:ls',
        },
      ]);
    });
  });

  it('lists the drains on the scope', async () => {
    useDrains();
    client.setArgv('drains', 'ls');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    await expect(client.stderr).toOutput('Drains found under');
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('prod-logs');
    expect(stdout).toContain('logs.example.com');
    expect(stdout).toContain('Active');
  });

  it('handles an empty list', async () => {
    useDrains([]);
    client.setArgv('drains', 'ls');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No drains found under');
  });

  it('outputs redacted JSON and never leaks secrets', async () => {
    useDrains();
    client.setArgv('drains', 'ls', '--json');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).not.toContain('whsec_do_not_leak');
    expect(stdout).not.toContain('sk_do_not_leak');

    const parsed = JSON.parse(stdout);
    const [drain] = parsed.drains;
    expect(drain.name).toEqual('prod-logs');
    expect('secret' in drain.delivery).toBe(false);
    expect(drain.delivery.headers.Authorization).toBeNull();
  });

  it('surfaces the plan/permission error on 403', async () => {
    client.scenario.get('/v1/drains', (_req, res) => {
      res.status(403).json({
        error: {
          code: 'forbidden',
          message: 'Drains are not available for this team.',
        },
      });
    });
    client.setArgv('drains', 'ls');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Drains are not available for this team.'
    );
  });

  it('renders an errored drain', async () => {
    useDrains([
      {
        ...defaultDrain,
        id: 'drn_err',
        name: 'errored-logs',
        status: 'errored',
        firstErrorTimestamp: 1600000000000,
      },
    ]);
    client.setArgv('drains', 'ls');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);
    expect(client.stdout.getFullOutput()).toContain('Errored');
  });

  it('renders every delivery type in the destination column', async () => {
    useDrains([
      defaultDrain,
      {
        ...defaultDrain,
        id: 'drn_s3',
        name: 'audit-s3',
        schemas: { audit_log: { version: 'v1' } },
        delivery: {
          type: 's3',
          endpoint: 's3://bucket',
          encoding: 'json',
          compression: 'none',
          fileStructure: 'hive',
          roleArn: 'arn:aws:iam::1:role/x',
          region: 'us-east-1',
        },
      },
    ]);
    client.setArgv('drains', 'ls');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);
    expect(client.stdout.getFullOutput()).toContain('S3 us-east-1');
  });
});
