import { describe, beforeEach, expect, it } from 'vitest';
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
  const received: { body?: unknown } = {};
  client.scenario.patch(`/v1/domains/records/${recordId}`, (req, res) => {
    received.body = req.body;
    res.json({ ...UPDATED_RECORD, id: recordId });
  });
  return received;
}

describe('dns update', () => {
  beforeEach(() => {
    useUser();
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

    it('errors when more than one argument is passed', async () => {
      client.setArgv('dns', 'update', 'rec_123', 'extra');
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

  it('updates a record and tracks telemetry', async () => {
    usePatchRecord('rec_123');
    client.setArgv('dns', 'update', 'rec_123', '--value', '9.9.9.9');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(0);

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
    const received = usePatchRecord('rec_123');
    client.setArgv(
      'dns',
      'update',
      'rec_123',
      '--value',
      '9.9.9.9',
      '--ttl',
      '300'
    );
    const exitCode = await dns(client);
    expect(exitCode).toEqual(0);

    expect(received.body).toEqual({
      value: '9.9.9.9',
      ttl: 300,
    });
  });

  it('sends every supported field when provided', async () => {
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

  it('outputs the updated record as JSON with --json', async () => {
    usePatchRecord('rec_123');
    client.setArgv('dns', 'update', 'rec_123', '--value', '9.9.9.9', '--json');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.id).toEqual('rec_123');
    expect(parsed.recordType).toEqual('A');
    expect(parsed.value).toEqual('9.9.9.9');
    expect(parsed.domain).toEqual('example.com');

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
      {
        key: 'flag:json',
        value: 'TRUE',
      },
    ]);
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

  it('maps a 403 to a permission message', async () => {
    client.scenario.patch('/v1/domains/records/rec_403', (_req, res) => {
      res.status(403).json({ error: { code: 'forbidden', message: 'nope' } });
    });
    client.setArgv('dns', 'update', 'rec_403', '--value', '9.9.9.9');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput("You don't have permission");
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

  describe('errors', () => {
    it('rejects unknown flags', async () => {
      client.setArgv('dns', 'update', 'rec_123', '--unknown');
      const exitCode = await dns(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: unknown or unexpected option: --unknown'
      );
    });
  });
});
