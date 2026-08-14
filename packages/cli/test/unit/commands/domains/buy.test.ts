import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

describe('domains buy', () => {
  let origCI: string | undefined;

  // Force the `CI` env var to not be set, because that
  // alters the behavior of this command (skips prompts)
  beforeAll(() => {
    origCI = process.env.CI;
    delete process.env.CI;
  });

  afterAll(() => {
    process.env.CI = origCI;
  });

  it('should track subcommand usage', async () => {
    client.setArgv('domains', 'buy');
    const exitCode = await domains(client);
    expect(exitCode, 'exit code for "domains"').toEqual(1);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:buy',
        value: 'buy',
      },
    ]);
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'buy';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = domains(client);
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
    it('emits purchase_requires_user and does not prompt', async () => {
      useUser();
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('domains', 'buy', 'brookedato.tech', '--non-interactive');
      await expect(domains(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('purchase_requires_user');
      expect(payload.message).toContain('Agents must not purchase');
      expect(payload.message).toContain('interactively');
      expect(
        payload.next.some(
          (n: { when?: string }) =>
            n.when &&
            n.when.includes('user') &&
            n.when.includes('interactively')
        )
      ).toBe(true);

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });
  });

  describe('[name]', () => {
    it('should track redacted domain name positional argument', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.com/price',
        (req, res) => {
          return res.json({
            purchasePrice: 100,
            renewalPrice: 100,
            transferPrice: null,
            years: 1,
          });
        }
      );
      client.scenario.get(
        '/v1/registrar/domains/example.com/availability',
        (req, res) => {
          return res.json({
            available: true,
          });
        }
      );

      client.setArgv('domains', 'buy', 'example.com');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput('Buy now for $100 (1yr)?');
      client.stdin.write('n\n');
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:buy',
          value: 'buy',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
      ]);
    });
  });
});
