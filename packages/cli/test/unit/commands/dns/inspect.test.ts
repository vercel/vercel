import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import dns from '../../../../src/commands/dns';
import { useUser } from '../../../mocks/user';

const RECORD = {
  id: 'rec_123',
  slug: 'www-example-com',
  name: 'www',
  type: 'A',
  value: '1.2.3.4',
  creator: 'user_abc',
  ttl: 300,
  comment: 'points at the load balancer',
  mxPriority: undefined,
  created: 1729878610745,
  createdAt: 1729878610745,
  updated: 1729878610745,
  updatedAt: 1729878610745,
  domain: 'example.com',
};

const OTHER_RECORD = {
  id: 'rec_456',
  slug: 'api-example-com',
  name: 'api',
  type: 'CNAME',
  value: 'cname.vercel-dns.com',
  creator: 'system',
  created: 1729878610745,
  createdAt: 1729878610745,
  updated: 1729878610745,
  updatedAt: 1729878610745,
  domain: 'example.com',
};

function useDomainRecords() {
  client.scenario.get('/v4/domains/example.com/records', (_req, res) => {
    res.json({
      records: [OTHER_RECORD, RECORD],
      pagination: { count: 2, total: 2, page: 1, pages: 1 },
    });
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

    it('errors when only the domain is passed', async () => {
      client.setArgv('dns', 'inspect', 'example.com');
      const exitCode = await dns(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  it('shows the record in full and tracks telemetry', async () => {
    useDomainRecords();
    client.setArgv('dns', 'inspect', 'example.com', 'rec_123');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('rec_123');
    expect(stdout).toContain('www');
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
        key: 'argument:domain',
        value: '[REDACTED]',
      },
      {
        key: 'argument:id',
        value: '[REDACTED]',
      },
    ]);
  });

  it('outputs the record as JSON with --json', async () => {
    useDomainRecords();
    client.setArgv('dns', 'inspect', 'example.com', 'rec_123', '--json');
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
        key: 'argument:domain',
        value: '[REDACTED]',
      },
      {
        key: 'argument:id',
        value: '[REDACTED]',
      },
    ]);
  });

  it('supports --format json', async () => {
    useDomainRecords();
    client.setArgv(
      'dns',
      'inspect',
      'example.com',
      'rec_123',
      '--format',
      'json'
    );
    const exitCode = await dns(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.id).toEqual('rec_123');
  });

  it('errors when the record is not found in the domain', async () => {
    useDomainRecords();
    client.setArgv('dns', 'inspect', 'example.com', 'rec_missing');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('DNS record not found');
  });

  it('errors when the domain is not found', async () => {
    client.scenario.get('/v4/domains/missing.com/records', (_req, res) => {
      res.status(404).json({ error: { code: 'not_found', message: 'nope' } });
    });
    client.setArgv('dns', 'inspect', 'missing.com', 'rec_123');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      "The domain missing.com can't be found"
    );
  });

  it('maps a 403 to a permission message', async () => {
    client.scenario.get('/v4/domains/example.com/records', (_req, res) => {
      res.status(403).json({ error: { code: 'forbidden', message: 'nope' } });
    });
    client.setArgv('dns', 'inspect', 'example.com', 'rec_123');
    const exitCode = await dns(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput("You don't have permission");
  });

  describe('errors', () => {
    it('rejects unknown flags', async () => {
      client.setArgv('dns', 'inspect', 'example.com', 'rec_123', '--unknown');
      const exitCode = await dns(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: unknown or unexpected option: --unknown'
      );
    });
  });
});
