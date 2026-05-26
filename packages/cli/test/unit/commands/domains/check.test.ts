import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import domains from '../../../../src/commands/domains';
import { useUser } from '../../../mocks/user';

describe('domains check', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'check';

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
    it('prints when the domain is available', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.com/availability',
        (_req, res) => {
          res.json({
            available: true,
          });
        }
      );

      client.setArgv('domains', 'check', 'example.com');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      await expect(client.stderr).toOutput('is available');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:check',
          value: 'check',
        },
      ]);
    });

    it('prints when the domain is unavailable', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.com/availability',
        (_req, res) => {
          res.json({
            available: false,
          });
        }
      );

      client.setArgv('domains', 'check', 'example.com');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      await expect(client.stderr).toOutput('is unavailable');
    });

    it('outputs json when requested', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.com/availability',
        (_req, res) => {
          res.json({
            available: true,
          });
        }
      );

      client.setArgv('domains', 'check', 'example.com', '--format=json');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toMatchInlineSnapshot(`
        "{
          "domain": "example.com",
          "available": true
        }
        "
      `);
    });
  });
});
