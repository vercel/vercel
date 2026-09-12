import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import dns from '../../../../src/commands/dns';
import { useUser } from '../../../mocks/user';

const UPDATED_RECORD = {
  id: 'rec_123',
  name: 'www',
  type: 'record',
  recordType: 'A',
  value: '9.9.9.9',
  creator: 'user_abc',
  domain: 'example.com',
  ttl: 300,
  createdAt: 1729878610745,
};

function usePatchRecord(recordId: string) {
  const received: { body?: unknown; called: boolean } = { called: false };
  client.scenario.patch(`/v1/domains/records/${recordId}`, (req, res) => {
    received.called = true;
    received.body = req.body;
    res.json({ ...UPDATED_RECORD, id: recordId });
  });
  return received;
}

describe('dns update', () => {
  let originalConfirm: typeof client.input.confirm;

  beforeEach(() => {
    useUser();
    originalConfirm = client.input.confirm;
    client.input.confirm = vi.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    client.input.confirm = originalConfirm;
    client.nonInteractive = false;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('dns', 'update', '--help');
      const exitCodePromise = dns(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'dns:update',
        },
      ]);
    });
  });

  describe('missing arguments', () => {
    it('errors when no record id is passed', async () => {
      client.setArgv('dns', 'update');
      const exitCode = await dns(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  it('errors when no fields are provided', async () => {
    client.setArgv('dns', 'update', 'rec_123');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Provide at least one field to update'
    );
  });

  it('updates a record after confirmation and tracks telemetry', async () => {
    usePatchRecord('rec_123');
    client.setArgv('dns', 'update', 'rec_123', '--value', '9.9.9.9');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(0);

    expect(client.input.confirm).toHaveBeenCalled();
    await expect(client.stderr).toOutput(
      'Success! DNS record rec_123 of domain example.com updated'
    );

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:update',
        value: 'update',
      },
      {
        key: 'argument:id',
        value: '[REDACTED]',
      },
      {
        key: 'option:value',
        value: '[REDACTED]',
      },
    ]);
  });

  it('sends only the provided fields in the request body', async () => {
    const received = usePatchRecord('rec_mx');
    client.setArgv(
      'dns',
      'update',
      'rec_mx',
      '--name',
      '@',
      '--type',
      'MX',
      '--value',
      'mail.example.com',
      '--ttl',
      '60',
      '--mx-priority',
      '10',
      '--comment',
      'mail exchanger'
    );
    const exitCode = await dns(client);
    expect(exitCode).toEqual(0);

    expect(received.body).toEqual({
      name: '',
      type: 'MX',
      value: 'mail.example.com',
      ttl: 60,
      mxPriority: 10,
      comment: 'mail exchanger',
    });
  });

  it('does not update when the user declines confirmation', async () => {
    const received = usePatchRecord('rec_123');
    client.input.confirm = vi.fn().mockResolvedValue(false);
    client.setArgv('dns', 'update', 'rec_123', '--value', '9.9.9.9');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(0);
    expect(received.called).toBe(false);
    await expect(client.stderr).toOutput('Canceled');
  });

  it('sends the srv object when all srv flags are provided', async () => {
    const received = usePatchRecord('rec_srv');
    client.setArgv(
      'dns',
      'update',
      'rec_srv',
      '--srv-priority',
      '10',
      '--srv-weight',
      '0',
      '--srv-port',
      '389',
      '--srv-target',
      'zeit.party'
    );
    const exitCode = await dns(client);
    expect(exitCode).toEqual(0);

    expect(received.body).toEqual({
      srv: {
        priority: 10,
        weight: 0,
        port: 389,
        target: 'zeit.party',
      },
    });
  });

  it('errors when only some srv flags are provided', async () => {
    client.setArgv('dns', 'update', 'rec_srv', '--srv-port', '389');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Updating an SRV record requires all of'
    );
  });

  it('errors when --ttl is not a number', async () => {
    client.setArgv('dns', 'update', 'rec_123', '--ttl', 'abc');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('--ttl option must be a number');
  });

  it('maps a 404 to a not-found message', async () => {
    client.scenario.patch('/v1/domains/records/rec_missing', (_req, res) => {
      res.status(404).json({ error: { code: 'not_found', message: 'nope' } });
    });
    client.setArgv('dns', 'update', 'rec_missing', '--value', '9.9.9.9');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('DNS record not found');
  });

  it('surfaces the API message for a 400', async () => {
    client.scenario.patch('/v1/domains/records/rec_400', (_req, res) => {
      res.status(400).json({
        error: { code: 'invalid_ttl', message: 'TTL must be at least 60' },
      });
    });
    client.setArgv('dns', 'update', 'rec_400', '--ttl', '1');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('TTL must be at least 60');
  });

  describe('non-interactive mode', () => {
    it('outputs action_required JSON when no record id is passed', async () => {
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('dns', 'update', '--non-interactive');
      await expect(dns(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('missing_arguments');
      expect(payload.next[0].command).toContain('dns update');
      expect(payload.next[0].command).toContain('<id>');

      logSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('outputs action_required JSON when no fields are provided', async () => {
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('dns', 'update', 'rec_123', '--non-interactive');
      await expect(dns(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('no_changes_requested');
      expect(payload.message).toContain('at least one field');

      logSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('outputs invalid_arguments error JSON when --ttl is not a number', async () => {
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv(
        'dns',
        'update',
        'rec_123',
        '--ttl',
        'abc',
        '--non-interactive'
      );
      await expect(dns(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_arguments');
      expect(payload.message).toContain('--ttl');

      logSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('outputs invalid_arguments error JSON when only some srv flags are provided', async () => {
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv(
        'dns',
        'update',
        'rec_srv',
        '--srv-port',
        '389',
        '--non-interactive'
      );
      await expect(dns(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_arguments');
      expect(payload.message).toContain('Updating an SRV record requires');

      logSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('requires interactive confirmation (no --yes) and outputs action_required JSON', async () => {
      const received = usePatchRecord('rec_123');
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv(
        'dns',
        'update',
        'rec_123',
        '--value',
        '9.9.9.9',
        '--non-interactive'
      );
      await expect(dns(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('interactive_confirmation_required');
      expect(payload.action).toBe('confirmation_required');
      expect(payload.userActionRequired).toBe(true);
      expect(payload.next[0].command).toContain('dns update');
      expect(payload.next[0].command).not.toContain('--non-interactive');
      expect(received.called).toBe(false);

      logSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('errors without emitting JSON when stdin is not a TTY (human pipe)', async () => {
      const received = usePatchRecord('rec_123');
      client.stdin.isTTY = false;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);

      client.setArgv('dns', 'update', 'rec_123', '--value', '9.9.9.9');
      const exitCode = await dns(client);
      expect(exitCode).toEqual(1);
      expect(logSpy).not.toHaveBeenCalled();
      expect(received.called).toBe(false);
      await expect(client.stderr).toOutput('must be run interactively');

      logSpy.mockRestore();
    });
  });
});
