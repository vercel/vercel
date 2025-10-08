import { describe, beforeEach, expect, it } from 'vitest';
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
