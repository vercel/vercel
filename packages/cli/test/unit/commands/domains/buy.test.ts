import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

  describe('[name]', () => {
    it('should track redacted domain name positional argument', async () => {
      useUser();
      client.scenario.get('/v3/domains/price', (req, res) => {
        return res.json({
          price: 100,
          period: 1,
        });
      });
      client.scenario.get('/v3/domains/status', (req, res) => {
        return res.json({
          available: true,
        });
      });

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
