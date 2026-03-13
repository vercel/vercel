import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import dns from '../../../../src/commands/dns';
import { useUser } from '../../../mocks/user';
import { useDns } from '../../../mocks/dns';

describe('dns add', () => {
  beforeEach(() => {
    useUser();
    useDns();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'dns';
      const subcommand = 'add';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = dns(client);
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
    it('errors when only domain is provided (no record details)', async () => {
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('dns', 'add', 'example.com');
      await expect(dns(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('missing_arguments');
      expect(payload.message).toContain('full record details');
      expect(payload.next[0].command).toContain('dns add');
      expect(payload.next[0].command).toContain('<domain>');

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });

    it('succeeds when full record details are provided', async () => {
      client.nonInteractive = true;
      client.scenario.post(`/v3/domains/:domain?/records`, (_req, res) => {
        res.json({ uid: 'rec_123' });
      });
      client.setArgv('dns', 'add', 'example.com', 'www', 'A', '1.2.3.4');
      const exitCode = await dns(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput(
        'Success! DNS record for domain example.com (rec_123) created'
      );
    });
  });

  it('tracks arguments', async () => {
    const recordId = '1';
    client.scenario.get(`/v5/domains/records/${recordId}`, (_req, res) => {
      res.json({
        id: '1',
        type: 'A',
        value: '',
        mxPriority: '1',
        domain: {
          domainName: 'example.com',
        },
        createdAt: '1729878610745',
        name: 'Example',
      });
    });
    client.scenario.post(`/v3/domains/:domain?/records`, (_req, res) => {
      res.json({
        uid: recordId,
      });
    });
    client.setArgv(
      'dns',
      'add',
      'some-domain',
      'some-name.com',
      'SRV',
      '10',
      '5',
      '5223',
      'example.some-name.com'
    );
    const exitCodePromise = dns(client);

    await expect(client.stderr).toOutput(
      `Success! DNS record for domain some-domain (${recordId}) created`
    );

    client.stdin.write('y\n');

    const exitCode = await exitCodePromise;
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:add',
        value: 'add',
      },
      {
        key: 'argument:domain',
        value: '[REDACTED]',
      },
      {
        key: 'argument:name',
        value: '[REDACTED]',
      },
      {
        key: 'argument:type',
        value: 'SRV',
      },
      {
        key: 'argument:values',
        value: '[REDACTED]',
      },
    ]);
  });
});
