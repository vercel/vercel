import { describe, expect, it } from 'vitest';
import webhooks from '../../../../src/commands/webhooks';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useCreateWebhook } from '../../../mocks/webhooks';

describe('webhooks create', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'webhooks';
      const subcommand = 'create';

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

  it('should show error when no url provided', async () => {
    client.setArgv('webhooks', 'create');
    const exitCode = await webhooks(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('expects one argument');
  });

  it('should show error when no events provided', async () => {
    client.setArgv('webhooks', 'create', 'https://example.com/webhook');
    const exitCode = await webhooks(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('At least one event is required');
  });

  it('should show error for invalid URL', async () => {
    client.setArgv(
      'webhooks',
      'create',
      'not-a-valid-url',
      '--event',
      'deployment.created'
    );
    const exitCode = await webhooks(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid URL');
  });

  it('should create webhook successfully', async () => {
    useUser();
    useCreateWebhook();
    client.setArgv(
      'webhooks',
      'create',
      'https://example.com/webhook',
      '--event',
      'deployment.created'
    );
    const exitCode = await webhooks(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Webhook created');
    await expect(client.stderr).toOutput('Save this secret');
  });

  it('should create webhook with multiple events', async () => {
    useUser();
    useCreateWebhook();
    client.setArgv(
      'webhooks',
      'create',
      'https://example.com/webhook',
      '--event',
      'deployment.created',
      '--event',
      'deployment.ready'
    );
    const exitCode = await webhooks(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Webhook created');
  });

  it('tracks subcommand invocation', async () => {
    useUser();
    useCreateWebhook();
    client.setArgv(
      'webhooks',
      'create',
      'https://example.com/webhook',
      '--event',
      'deployment.created'
    );
    const exitCode = await webhooks(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:create',
        value: 'create',
      },
      {
        key: 'argument:url',
        value: '[REDACTED]',
      },
      {
        key: 'option:event',
        value: '1',
      },
    ]);
  });

  it('tracks multiple events in telemetry', async () => {
    useUser();
    useCreateWebhook();
    client.setArgv(
      'webhooks',
      'create',
      'https://example.com/webhook',
      '--event',
      'deployment.created',
      '--event',
      'deployment.ready',
      '--event',
      'deployment.error'
    );
    const exitCode = await webhooks(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:create',
        value: 'create',
      },
      {
        key: 'argument:url',
        value: '[REDACTED]',
      },
      {
        key: 'option:event',
        value: '3',
      },
    ]);
  });

  describe('add alias', () => {
    it('should work with add alias', async () => {
      useUser();
      useCreateWebhook();
      client.setArgv(
        'webhooks',
        'add',
        'https://example.com/webhook',
        '--event',
        'deployment.created'
      );
      const exitCode = await webhooks(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:create',
          value: 'add',
        },
        {
          key: 'argument:url',
          value: '[REDACTED]',
        },
        {
          key: 'option:event',
          value: '1',
        },
      ]);
    });
  });
});
