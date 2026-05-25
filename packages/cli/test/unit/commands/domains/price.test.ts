import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import domains from '../../../../src/commands/domains';
import { useUser } from '../../../mocks/user';

describe('domains price', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'price';

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

  describe('[domain]', () => {
    it('prints registrar pricing when API returns a quote', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.com/price',
        (_req, res) => {
          res.json({
            purchasePrice: 10,
            renewalPrice: 20,
            transferPrice: 30,
            years: 1,
          });
        }
      );

      client.setArgv('domains', 'price', 'example.com');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      const out = client.stderr.getFullOutput();
      expect(out).toContain('Registrar pricing for example.com');
      expect(out).toContain('Purchase: $10');
      expect(out).toContain('Renewal:  $20');
      expect(out).toContain('Transfer: $30');
      expect(out).toContain('1 year(s)');

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:price',
          value: 'price',
        },
      ]);
    });
  });
});
