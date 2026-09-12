import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import dns from '../../../../src/commands/dns';
import { useUser } from '../../../mocks/user';

const RECORD = {
  id: 'rec_123',
  name: 'www',
  type: 'A',
  value: '1.2.3.4',
  creator: 'user_abc',
  ttl: 300,
  comment: 'points at the load balancer',
  createdAt: 1729878610745,
  domain: 'example.com',
};

function useRecord() {
  client.scenario.get('/v5/domains/records/rec_123', (_req, res) => {
    res.json(RECORD);
  });
}

describe('dns inspect', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('dns', 'inspect', '--help');
      const exitCodePromise = dns(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'dns:inspect',
        },
      ]);
    });
  });

  describe('missing arguments', () => {
    it('errors when no arguments are passed', async () => {
      client.setArgv('dns', 'inspect');
      const exitCode = await dns(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  it('shows the record in full and tracks telemetry', async () => {
    useRecord();
    client.setArgv('dns', 'inspect', 'rec_123');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('rec_123');
    expect(stdout).toContain('www');
    expect(stdout).toContain('example.com');
    expect(stdout).toContain('A');
    expect(stdout).toContain('1.2.3.4');
    expect(stdout).toContain('300');
    expect(stdout).toContain('points at the load balancer');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:inspect',
        value: 'inspect',
      },
      {
        key: 'argument:id',
        value: '[REDACTED]',
      },
    ]);
  });

  it('renders the priority for MX records, preserving a priority of 0', async () => {
    const mxRecord = {
      id: 'rec_mx',
      name: '@',
      type: 'MX',
      value: 'mail.example.com',
      mxPriority: 0,
      creator: 'user_abc',
      createdAt: 1729878610745,
      domain: 'example.com',
    };
    client.scenario.get('/v5/domains/records/rec_mx', (_req, res) => {
      res.json(mxRecord);
    });
    client.setArgv('dns', 'inspect', 'rec_mx');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('Priority');
    expect(stdout).toContain('0');
  });

  it('renders the priority for SRV/HTTPS records from the priority field', async () => {
    const srvRecord = {
      id: 'rec_srv',
      name: '_sip._tcp',
      type: 'SRV',
      value: '10 5 5060 sip.example.com',
      priority: 10,
      creator: 'user_abc',
      createdAt: 1729878610745,
      domain: 'example.com',
    };
    client.scenario.get('/v5/domains/records/rec_srv', (_req, res) => {
      res.json(srvRecord);
    });
    client.setArgv('dns', 'inspect', 'rec_srv');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('Priority');
    expect(stdout).toContain('10');
  });

  it('omits the priority row when neither field is present', async () => {
    useRecord();
    client.setArgv('dns', 'inspect', 'rec_123');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).not.toContain('Priority');
  });

  it('outputs the record as JSON with --json', async () => {
    useRecord();
    client.setArgv('dns', 'inspect', 'rec_123', '--json');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.id).toEqual('rec_123');
    expect(parsed.name).toEqual('www');
    expect(parsed.type).toEqual('A');
    expect(parsed.value).toEqual('1.2.3.4');
    expect(parsed.ttl).toEqual(300);
    expect(parsed.comment).toEqual('points at the load balancer');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:inspect',
        value: 'inspect',
      },
      {
        key: 'flag:json',
        value: 'TRUE',
      },
      {
        key: 'argument:id',
        value: '[REDACTED]',
      },
    ]);
  });

  it('errors when the record is not found', async () => {
    client.scenario.get('/v5/domains/records/rec_missing', (_req, res) => {
      res.status(404).json({ error: { code: 'not_found', message: 'nope' } });
    });
    client.setArgv('dns', 'inspect', 'rec_missing');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('DNS record not found');
  });

  it('maps a 403 to a permission message', async () => {
    client.scenario.get('/v5/domains/records/rec_403', (_req, res) => {
      res.status(403).json({ error: { code: 'forbidden', message: 'nope' } });
    });
    client.setArgv('dns', 'inspect', 'rec_403');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput("You don't have permission");
  });

  describe('errors', () => {
    it('rejects unknown flags', async () => {
      client.setArgv('dns', 'inspect', 'rec_123', '--unknown');
      const exitCode = await dns(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: unknown or unexpected option: --unknown'
      );
    });
  });
});
