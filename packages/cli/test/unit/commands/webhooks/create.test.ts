import { describe, expect, it, vi, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import webhooks from '../../../../src/commands/webhooks';
import { useUser } from '../../../mocks/user';
import { useCreateWebhook } from '../../../mocks/webhooks';

vi.mock('../../../../src/util/webhooks/get-webhook-events', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../src/util/webhooks/get-webhook-events')
  >('../../../../src/util/webhooks/get-webhook-events');
  return {
    ...actual,
    getWebhookEvents: vi
      .fn()
      .mockResolvedValue([
        'deployment.created',
        'deployment.ready',
        'deployment.error',
      ]),
  };
});

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

  describe('non-interactive mode', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('outputs error JSON when no url provided', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error('exit');
      }) as () => never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      client.setArgv('webhooks', 'create');
      client.nonInteractive = true;
      const exitCodePromise = webhooks(client);

      await expect(exitCodePromise).rejects.toThrow('exit');
      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
      );
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_url',
        message: expect.stringMatching(/URL|required/),
      });
      expect(payload.next[0].command).toBe('vercel webhooks create <url>');
    });

    it('substitutes original flags into suggested command when url is missing', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error('exit');
      }) as () => never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      client.setArgv(
        'webhooks',
        'create',
        '--event',
        'deployment.created',
        '--cwd',
        '/tmp',
        '--non-interactive'
      );
      client.nonInteractive = true;
      const exitCodePromise = webhooks(client);

      await expect(exitCodePromise).rejects.toThrow('exit');
      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
      );
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('missing_url');
      expect(payload.next[0].command).toBe(
        'vercel webhooks create <url> --event deployment.created --cwd /tmp --non-interactive'
      );
    });

    it('outputs error JSON when no events provided', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error('exit');
      }) as () => never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      client.setArgv('webhooks', 'create', 'https://example.com/webhook');
      client.nonInteractive = true;
      const exitCodePromise = webhooks(client);

      await expect(exitCodePromise).rejects.toThrow('exit');
      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
      );
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_events',
        message: expect.stringMatching(/event|required/),
      });
      expect(payload.next[0].command).toBe(
        'vercel webhooks create <url> --event <event>'
      );
    });

    it('outputs error JSON for invalid event type and suggests command with original flags', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error('exit');
      }) as () => never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      client.setArgv(
        'webhooks',
        'create',
        'https://brookemosby.tech',
        '--event',
        'create',
        '--cwd',
        '/tmp',
        '--non-interactive'
      );
      client.nonInteractive = true;
      const exitCodePromise = webhooks(client);

      await expect(exitCodePromise).rejects.toThrow('exit');
      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
      );
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'invalid_arguments',
        message: expect.stringMatching(/Invalid event type.*create/),
        hint: 'See available events: https://vercel.com/docs/webhooks/webhooks-api',
      });
      expect(payload.next).toHaveLength(1);
      expect(payload.next[0].command).toBe(
        'vercel webhooks create https://brookemosby.tech --cwd /tmp --non-interactive --event <event>'
      );
      expect(payload.next[0].command).not.toMatch(/`|\\u001b/);
    });

    it('outputs success JSON when url and events provided', async () => {
      useUser();
      useCreateWebhook();
      client.setArgv(
        'webhooks',
        'create',
        'https://example.com/webhook',
        '--event',
        'deployment.created'
      );
      client.nonInteractive = true;
      const exitCode = await webhooks(client);
      expect(exitCode).toEqual(0);
      const stdout = client.stdout.getFullOutput();
      const payload = JSON.parse(stdout);
      expect(payload).toMatchObject({
        status: 'ok',
        webhook: expect.objectContaining({
          id: expect.any(String),
          url: 'https://example.com/webhook',
          events: ['deployment.created'],
        }),
        message: expect.stringMatching(/created/),
        next: expect.any(Array),
      });
      expect(payload.next[0].command).toMatch(/^vercel webhooks get /);
      expect(payload.next[0].command).not.toMatch(/`|\\u001b/);
    });
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

  describe('interactive mode', () => {
    it('should prompt for URL when not provided', async () => {
      useUser();
      useCreateWebhook();
      client.setArgv('webhooks', 'create', '--event', 'deployment.created');
      const exitCodePromise = webhooks(client);

      // Wait for URL prompt and provide a valid URL
      await expect(client.stderr).toOutput('Webhook URL:');
      client.stdin.write('https://example.com/webhook\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Webhook created');
    });

    it('should validate URL in interactive prompt', async () => {
      useUser();
      useCreateWebhook();
      client.setArgv('webhooks', 'create', '--event', 'deployment.created');
      const exitCodePromise = webhooks(client);

      // Wait for URL prompt, enter an invalid URL
      await expect(client.stderr).toOutput('Webhook URL:');
      client.stdin.write('not-a-url\n');

      // Should show validation error and re-prompt
      await expect(client.stderr).toOutput('Invalid URL');
      client.stdin.write('\x15'); // Ctrl+U to clear stale input
      client.stdin.write('https://example.com/webhook\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('should prompt for events when not provided', async () => {
      const { getWebhookEvents } = await import(
        '../../../../src/util/webhooks/get-webhook-events'
      );
      vi.mocked(getWebhookEvents).mockResolvedValue([
        'deployment.created',
        'deployment.ready',
        'deployment.error',
      ]);
      useUser();
      useCreateWebhook();
      client.setArgv('webhooks', 'create', 'https://example.com/webhook');
      const exitCodePromise = webhooks(client);

      // Wait for event selection prompt, select first item and submit
      await expect(client.stderr).toOutput('Select events:');
      client.stdin.write(' '); // toggle first item (deployment.created)
      client.stdin.write('\n'); // submit

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Webhook created');
    });

    it('should error when getWebhookEvents returns empty', async () => {
      const { getWebhookEvents } = await import(
        '../../../../src/util/webhooks/get-webhook-events'
      );
      vi.mocked(getWebhookEvents).mockResolvedValueOnce([]);

      client.setArgv('webhooks', 'create', 'https://example.com/webhook');
      const exitCode = await webhooks(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Could not fetch available webhook events'
      );
    });
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
