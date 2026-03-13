import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import dns from '../../../../src/commands/dns';
import { useUser } from '../../../mocks/user';
import { useDns } from '../../../mocks/dns';

describe('dns rm', () => {
  beforeEach(() => {
    useUser();
    useDns();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'dns';
      const subcommand = 'rm';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = dns(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:rm`,
        },
      ]);
    });
  });

  describe('[id]', () => {
    it('tracks the use of the argument', async () => {
      const recordId = '1';
      client.scenario.get(`/v5/domains/records/${recordId}`, (req, res) => {
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
      client.scenario.delete(
        `/v3/domains/:domain?/records/${recordId}`,
        (req, res) => {
          res.json({});
        }
      );
      client.setArgv('dns', 'rm', recordId);
      const exitCodePromise = dns(client);

      await expect(client.stderr).toOutput(
        `The following record will be removed permanently`
      );

      client.stdin.write('y\n');
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:remove',
          value: 'rm',
        },
        {
          key: 'argument:recordId',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('non-interactive mode', () => {
    it('requires --yes and outputs action_required JSON', async () => {
      const recordId = '1';
      client.nonInteractive = true;
      client.scenario.get(`/v5/domains/records/${recordId}`, (_req, res) => {
        res.json({
          id: '1',
          type: 'A',
          value: '1.2.3.4',
          mxPriority: '',
          domain: { domainName: 'example.com' },
          createdAt: '1729878610745',
          name: 'www',
        });
      });
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('dns', 'rm', recordId, '--non-interactive');
      await expect(dns(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('confirmation_required');
      expect(payload.next[0].command).toContain('dns rm');
      expect(payload.next[0].command).toContain('--yes');

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });
  });

  describe('--yes', () => {
    it('skips the confirmation prompt', async () => {
      const recordId = '1';
      client.scenario.get(`/v5/domains/records/${recordId}`, (req, res) => {
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
      client.scenario.delete(
        `/v3/domains/:domain?/records/${recordId}`,
        (req, res) => {
          res.json({});
        }
      );
      client.setArgv('dns', 'rm', recordId, '--yes');
      const exitCode = await dns(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:remove',
          value: 'rm',
        },
        {
          key: 'argument:recordId',
          value: '[REDACTED]',
        },
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });

    it('supports -y shorthand', async () => {
      const recordId = '1';
      client.scenario.get(`/v5/domains/records/${recordId}`, (req, res) => {
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
      client.scenario.delete(
        `/v3/domains/:domain?/records/${recordId}`,
        (req, res) => {
          res.json({});
        }
      );
      client.setArgv('dns', 'rm', recordId, '-y');
      const exitCode = await dns(client);
      expect(exitCode).toEqual(0);
    });
  });

  describe('errors', () => {
    it('rejects unknown flags', async () => {
      client.setArgv('dns', 'rm', 'rec_123', '--unknown');
      const exitCode = await dns(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: unknown or unexpected option: --unknown'
      );
    });
  });
});
