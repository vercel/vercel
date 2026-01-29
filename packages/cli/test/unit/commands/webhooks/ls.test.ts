import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import webhooks from '../../../../src/commands/webhooks';
import { useUser } from '../../../mocks/user';
import { useWebhooks } from '../../../mocks/webhooks';

describe('webhooks ls', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'webhooks';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = webhooks(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('should list webhooks', async () => {
    useUser();
    useWebhooks(5);
    client.setArgv('webhooks', 'ls');
    const exitCode = await webhooks(client);
    expect(exitCode, 'exit code for "webhooks ls"').toEqual(0);
    await expect(client.stderr).toOutput('5 Webhooks found');
  });

  it('tracks subcommand invocation', async () => {
    useUser();
    useWebhooks(5);
    client.setArgv('webhooks', 'ls');
    const exitCode = await webhooks(client);
    expect(exitCode, 'exit code for "webhooks ls"').toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:list',
        value: 'ls',
      },
    ]);
  });

  describe('--limit', () => {
    it('should list up to 2 webhooks if limit set to 2', async () => {
      useUser();
      useWebhooks(10);
      client.setArgv('webhooks', 'ls', '--limit', '2');
      const exitCode = await webhooks(client);
      expect(exitCode, 'exit code for "webhooks ls"').toEqual(0);

      await expect(client.stderr).toOutput('2 Webhooks found');
    });

    it('tracks telemetry data', async () => {
      useUser();
      useWebhooks(10);
      client.setArgv('webhooks', 'ls', '--limit', '2');
      const exitCode = await webhooks(client);
      expect(exitCode, 'exit code for "webhooks ls"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
        {
          key: 'option:limit',
          value: '2',
        },
      ]);
    });
  });

  describe('--next', () => {
    it('tracks telemetry data', async () => {
      useUser();
      useWebhooks(5);
      client.setArgv('webhooks', 'ls', '--next', '1730124407638');
      const exitCode = await webhooks(client);
      expect(exitCode, 'exit code for "webhooks ls"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
        {
          key: 'option:next',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--format', () => {
    it('tracks telemetry for --format json', async () => {
      useUser();
      useWebhooks(5);
      client.setArgv('webhooks', 'ls', '--format', 'json');
      const exitCode = await webhooks(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
        {
          key: 'option:format',
          value: 'json',
        },
      ]);
    });

    it('outputs webhooks as valid JSON', async () => {
      useUser();
      useWebhooks(5);
      client.setArgv('webhooks', 'ls', '--format', 'json');
      const exitCode = await webhooks(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      // Should be valid JSON - this will throw if not parseable
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput).toHaveProperty('webhooks');
      expect(Array.isArray(jsonOutput.webhooks)).toBe(true);
    });

    it('outputs correct webhook structure in JSON', async () => {
      useUser();
      useWebhooks(5);
      client.setArgv('webhooks', 'ls', '--format', 'json');
      const exitCode = await webhooks(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput.webhooks.length).toBeGreaterThan(0);
      const firstWebhook = jsonOutput.webhooks[0];
      expect(firstWebhook).toHaveProperty('id');
      expect(firstWebhook).toHaveProperty('url');
      expect(firstWebhook).toHaveProperty('events');
      expect(firstWebhook).toHaveProperty('createdAt');
    });
  });
});
