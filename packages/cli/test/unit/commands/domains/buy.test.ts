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

  describe('--non-interactive', () => {
    it('outputs error JSON with missing_domain when no domain provided', async () => {
      client.setArgv('domains', 'buy', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(domains(client)).rejects.toThrow('process.exit(1)');

      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('missing_domain');
      expect(payload.message).toContain('Domain name is required');
      expect(payload.next).toBeDefined();
      expect(payload.next[0].command).toContain('domains buy');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      logSpy.mockRestore();
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });

    it('outputs error JSON with invalid_domain when subdomain is provided', async () => {
      useUser();
      client.setArgv('domains', 'buy', 'sub.example.com', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(domains(client)).rejects.toThrow('process.exit(1)');

      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_domain');
      expect(payload.message).toContain('sub.example.com');
      expect(payload.next).toBeDefined();
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      logSpy.mockRestore();
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });

    it('outputs error JSON with interactive_required when domain is available', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.com/price',
        (_req, res) => {
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
        (_req, res) => {
          return res.json({ available: true });
        }
      );

      client.setArgv('domains', 'buy', 'example.com', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(domains(client)).rejects.toThrow('process.exit(1)');

      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('interactive_required');
      expect(payload.message).toContain('interactive mode');
      expect(payload.next).toBeDefined();
      expect(payload.next[0].command).toContain('domains buy example.com');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      logSpy.mockRestore();
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });
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
