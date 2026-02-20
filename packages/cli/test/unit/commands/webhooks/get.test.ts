import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import webhooks from '../../../../src/commands/webhooks';
import { useUser } from '../../../mocks/user';
import { useWebhook, useWebhookNotFound } from '../../../mocks/webhooks';

describe('webhooks get', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'webhooks';
      const subcommand = 'get';

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

  it('should show error when no id provided', async () => {
    client.setArgv('webhooks', 'get');
    const exitCode = await webhooks(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('expects one argument');
  });

  it('should get webhook details', async () => {
    useUser();
    useWebhook('hook_test123', {
      url: 'https://example.com/my-webhook',
      events: ['deployment.created', 'deployment.ready'],
    });
    client.setArgv('webhooks', 'get', 'hook_test123');
    const exitCode = await webhooks(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('hook_test123');
    await expect(client.stderr).toOutput('https://example.com/my-webhook');
  });

  it('should show error for non-existent webhook', async () => {
    useUser();
    useWebhookNotFound('hook_notfound');
    client.setArgv('webhooks', 'get', 'hook_notfound');
    const exitCode = await webhooks(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Webhook not found');
  });

  it('tracks subcommand invocation', async () => {
    useUser();
    useWebhook('hook_test123');
    client.setArgv('webhooks', 'get', 'hook_test123');
    const exitCode = await webhooks(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:get',
        value: 'get',
      },
      {
        key: 'argument:id',
        value: '[REDACTED]',
      },
    ]);
  });

  describe('--format', () => {
    it('tracks telemetry for --format json', async () => {
      useUser();
      useWebhook('hook_test123');
      client.setArgv('webhooks', 'get', 'hook_test123', '--format', 'json');
      const exitCode = await webhooks(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:get',
          value: 'get',
        },
        {
          key: 'argument:id',
          value: '[REDACTED]',
        },
        {
          key: 'option:format',
          value: 'json',
        },
      ]);
    });

    it('outputs webhook as valid JSON', async () => {
      useUser();
      useWebhook('hook_test123', {
        url: 'https://example.com/webhook',
        events: ['deployment.created'],
      });
      client.setArgv('webhooks', 'get', 'hook_test123', '--format', 'json');
      const exitCode = await webhooks(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput).toHaveProperty('id', 'hook_test123');
      expect(jsonOutput).toHaveProperty('url', 'https://example.com/webhook');
      expect(jsonOutput).toHaveProperty('events');
      expect(Array.isArray(jsonOutput.events)).toBe(true);
    });
  });

  describe('inspect alias', () => {
    it('should work with inspect alias', async () => {
      useUser();
      useWebhook('hook_test123');
      client.setArgv('webhooks', 'inspect', 'hook_test123');
      const exitCode = await webhooks(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:get',
          value: 'inspect',
        },
        {
          key: 'argument:id',
          value: '[REDACTED]',
        },
      ]);
    });
  });
});
