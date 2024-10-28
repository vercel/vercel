import { describe, expect, it } from 'vitest';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

describe('domains buy', () => {
  it('should track subcommand usage', async () => {
    client.setArgv('domains', 'buy');
    const exitCodePromise = domains(client);
    await expect(exitCodePromise).resolves.toEqual(1);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:buy',
        value: 'buy',
      },
    ]);
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
