import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import webhooks from '../../../../src/commands/webhooks';
import { useUser } from '../../../mocks/user';
import {
  useWebhook,
  useWebhookNotFound,
  useDeleteWebhook,
} from '../../../mocks/webhooks';

describe('webhooks rm', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'webhooks';
      const subcommand = 'rm';

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
    client.setArgv('webhooks', 'rm');
    const exitCode = await webhooks(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('expects one argument');
  });

  it('should show error for non-existent webhook', async () => {
    useUser();
    useWebhookNotFound('hook_notfound');
    client.setArgv('webhooks', 'rm', 'hook_notfound');
    const exitCode = await webhooks(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Webhook not found');
  });

  it('tracks subcommand invocation', async () => {
    client.setArgv('webhooks', 'rm');
    const exitCode = await webhooks(client);
    expect(exitCode).toEqual(1);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:remove',
        value: 'rm',
      },
    ]);
  });

  describe('[id]', () => {
    it('should track the redacted [id] positional argument', async () => {
      useUser();
      useWebhook('hook_test123', {
        url: 'https://example.com/webhook',
      });
      useDeleteWebhook('hook_test123');
      client.setArgv('webhooks', 'rm', 'hook_test123');
      const exitCodePromise = webhooks(client);
      await expect(client.stderr).toOutput(
        'Are you sure you want to remove webhook'
      );
      client.stdin.write('y\n');
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:remove',
          value: 'rm',
        },
        {
          key: 'argument:id',
          value: '[REDACTED]',
        },
      ]);
    });

    describe('--yes', () => {
      it('should skip confirmation with --yes flag', async () => {
        useUser();
        useWebhook('hook_test123', {
          url: 'https://example.com/webhook',
        });
        useDeleteWebhook('hook_test123');
        client.setArgv('webhooks', 'rm', 'hook_test123', '--yes');
        const exitCode = await webhooks(client);
        expect(exitCode).toEqual(0);
        // Verify output contains success message
        const output = client.stderr.getFullOutput();
        expect(output).toContain('removed');
      });

      it('should track usage of the --yes flag', async () => {
        useUser();
        useWebhook('hook_test123', {
          url: 'https://example.com/webhook',
        });
        useDeleteWebhook('hook_test123');
        client.setArgv('webhooks', 'rm', 'hook_test123', '--yes');
        const exitCode = await webhooks(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:remove',
            value: 'rm',
          },
          {
            key: 'argument:id',
            value: '[REDACTED]',
          },
          {
            key: 'flag:yes',
            value: 'TRUE',
          },
        ]);
      });
    });
  });

  describe('remove alias', () => {
    it('should work with remove alias', async () => {
      useUser();
      useWebhook('hook_test123');
      useDeleteWebhook('hook_test123');
      client.setArgv('webhooks', 'remove', 'hook_test123', '--yes');
      const exitCode = await webhooks(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:remove',
          value: 'remove',
        },
        {
          key: 'argument:id',
          value: '[REDACTED]',
        },
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('delete alias', () => {
    it('should work with delete alias', async () => {
      useUser();
      useWebhook('hook_test123');
      useDeleteWebhook('hook_test123');
      client.setArgv('webhooks', 'delete', 'hook_test123', '--yes');
      const exitCode = await webhooks(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:remove',
          value: 'delete',
        },
        {
          key: 'argument:id',
          value: '[REDACTED]',
        },
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });
  });
});
