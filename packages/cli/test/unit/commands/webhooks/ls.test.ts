import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import webhooks from '../../../../src/commands/webhooks';
import { useUser } from '../../../mocks/user';
import { useWebhooks, createWebhook } from '../../../mocks/webhooks';

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

  describe('API response formats', () => {
    it('handles array response format', async () => {
      useUser();
      // Mock the API response format (array directly)
      const webhooksData = [createWebhook('hook_1'), createWebhook('hook_2')];
      client.scenario.get('/v1/webhooks', (_req, res) => {
        res.json(webhooksData);
      });

      client.setArgv('webhooks', 'ls');
      const exitCode = await webhooks(client);
      expect(exitCode, 'exit code for "webhooks ls"').toEqual(0);
      await expect(client.stderr).toOutput('2 Webhooks found');
    });

    it('handles object response format', async () => {
      useUser();
      // Some APIs might return object with webhooks property
      const webhooksData = [
        createWebhook('hook_1'),
        createWebhook('hook_2'),
        createWebhook('hook_3'),
      ];
      client.scenario.get('/v1/webhooks', (_req, res) => {
        res.json({ webhooks: webhooksData });
      });

      client.setArgv('webhooks', 'ls');
      const exitCode = await webhooks(client);
      expect(exitCode, 'exit code for "webhooks ls"').toEqual(0);
      await expect(client.stderr).toOutput('3 Webhooks found');
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
